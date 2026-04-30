// Package service contains the NATS JetStream publisher used to notify
// downstream notification consumers (lurus-platform notification module)
// about LLM events such as image generation completion and usage milestones.
//
// The publisher is intentionally minimal:
//   - Single global instance (Publisher), initialized lazily by InitNATSPublisher.
//   - At-least-once delivery via JetStream PublishMsg (publish ack required).
//   - Async fire-and-forget from request handlers: Publish enqueues to a
//     bounded channel; a worker goroutine drains and publishes with retries.
//     This keeps user-facing handler latency unaffected by NATS hiccups.
//   - On final failure (after retries) the event is dropped with a structured
//     error log. Failed publishes are NOT propagated to the user request.
//
// Configuration (all via environment):
//   - NATS_URL: NATS server URL (e.g. "nats://nats.lurus-system.svc:4222").
//     If empty, the publisher is disabled (Publish becomes a no-op) so local
//     dev / test environments without NATS just skip publishing.
//   - NATS_PUBLISH_BUFFER: channel buffer size, default 256.
//   - NATS_PUBLISH_RETRIES: per-event retry count, default 2 (so total 3 tries).
//
// Why fire-and-forget over synchronous:
//   - LLM image generation already takes 5-30s; we must not add NATS RTT/backpressure
//     onto that latency budget.
//   - The notification consumer is the UX inbox. Lost notification ≠ broken request.
//   - For correctness we still require ack from the broker (at-least-once); we just
//     do that off the request path.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"

	natsgo "github.com/nats-io/nats.go"
)

// Default tuning constants. Exported only as defaults; runtime values come
// from environment variables to allow per-deployment override without recompile.
const (
	natsDefaultBuffer       = 256
	natsDefaultRetries      = 2
	natsPublishAckTimeout   = 5 * time.Second
	natsConnectTimeout      = 5 * time.Second
	natsBackoffInitial      = 100 * time.Millisecond
	natsBackoffMax          = 2 * time.Second
)

// EventPublisher is the abstraction used by callers. Tests inject a fake.
type EventPublisher interface {
	// Publish marshals payload to JSON and enqueues for async send to the given
	// subject. Returns an error only if the payload cannot be marshaled or the
	// publisher is overloaded; broker-level failures are handled async.
	Publish(ctx context.Context, subject string, payload any) error
}

// NoopEventPublisher discards all publishes. Used when NATS_URL is unset.
type NoopEventPublisher struct{}

// Publish is a no-op.
func (NoopEventPublisher) Publish(_ context.Context, _ string, _ any) error { return nil }

// natsPublisher is the production EventPublisher backed by JetStream.
type natsPublisher struct {
	js      natsgo.JetStreamContext
	nc      *natsgo.Conn
	queue   chan publishJob
	retries int
	wg      sync.WaitGroup
	closed  chan struct{}
}

type publishJob struct {
	subject string
	data    []byte
}

// Publisher is the global publisher instance. Defaults to a no-op until
// InitNATSPublisher succeeds, so call sites are safe to invoke at any time.
var Publisher EventPublisher = NoopEventPublisher{}

// InitNATSPublisher connects to NATS and starts the worker. Safe to call once
// during process bootstrap. If NATS_URL is empty, leaves Publisher as no-op
// (returns nil so missing NATS in dev does not fail-fast).
func InitNATSPublisher() error {
	url := os.Getenv("NATS_URL")
	if url == "" {
		common.SysLog("NATS_URL not set, event publishing disabled (no-op)")
		return nil
	}

	nc, err := natsgo.Connect(
		url,
		natsgo.Timeout(natsConnectTimeout),
		natsgo.MaxReconnects(-1),
		natsgo.ReconnectWait(2*time.Second),
		natsgo.Name("newapi-event-publisher"),
	)
	if err != nil {
		return fmt.Errorf("nats connect %s: %w", url, err)
	}

	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return fmt.Errorf("nats jetstream context: %w", err)
	}

	p := &natsPublisher{
		js:      js,
		nc:      nc,
		queue:   make(chan publishJob, envIntOrDefault("NATS_PUBLISH_BUFFER", natsDefaultBuffer)),
		retries: envIntOrDefault("NATS_PUBLISH_RETRIES", natsDefaultRetries),
		closed:  make(chan struct{}),
	}

	p.wg.Add(1)
	go p.worker()

	Publisher = p
	common.SysLog(fmt.Sprintf("NATS event publisher started, url=%s buffer=%d retries=%d", url, cap(p.queue), p.retries))
	return nil
}

// Publish marshals + enqueues. Non-blocking: if the buffer is full it drops
// with a warning rather than blocking the caller (we prefer dropped events
// over stalled user requests).
func (p *natsPublisher) Publish(_ context.Context, subject string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	select {
	case p.queue <- publishJob{subject: subject, data: data}:
		return nil
	default:
		// Buffer full. Drop with structured warning. The notification inbox
		// is best-effort; do not block billing/relay paths.
		common.SysError(fmt.Sprintf("nats publisher: buffer full, dropping event subject=%s payload_bytes=%d", subject, len(data)))
		return errors.New("publish queue full")
	}
}

// worker drains the queue and publishes to JetStream with retry/backoff.
func (p *natsPublisher) worker() {
	defer p.wg.Done()
	for {
		select {
		case <-p.closed:
			return
		case job := <-p.queue:
			p.publishWithRetry(job)
		}
	}
}

// publishWithRetry attempts ack-required PublishMsg up to (1+retries) times
// with exponential backoff between attempts.
func (p *natsPublisher) publishWithRetry(job publishJob) {
	backoff := natsBackoffInitial
	var lastErr error
	for attempt := 0; attempt <= p.retries; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), natsPublishAckTimeout)
		_, err := p.js.PublishMsg(&natsgo.Msg{
			Subject: job.subject,
			Data:    job.data,
		}, natsgo.Context(ctx))
		cancel()
		if err == nil {
			if common.DebugEnabled {
				common.SysLog(fmt.Sprintf("nats publisher: published subject=%s bytes=%d attempt=%d", job.subject, len(job.data), attempt))
			}
			return
		}
		lastErr = err
		if attempt < p.retries {
			common.SysLog(fmt.Sprintf("nats publisher: retry subject=%s attempt=%d err=%v", job.subject, attempt+1, err))
			time.Sleep(backoff)
			backoff *= 2
			if backoff > natsBackoffMax {
				backoff = natsBackoffMax
			}
		}
	}
	// Final failure: log and drop.
	common.SysError(fmt.Sprintf("nats publisher: gave up after %d attempts subject=%s err=%v", p.retries+1, job.subject, lastErr))
}

// Close stops the worker. Currently unused (process exits before drain),
// but exported for future graceful-shutdown wiring.
func (p *natsPublisher) Close() {
	close(p.closed)
	p.wg.Wait()
	p.nc.Close()
}

// envIntOrDefault reads an int env var with a fallback.
func envIntOrDefault(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}
