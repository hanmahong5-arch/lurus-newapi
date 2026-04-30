// Admin endpoint for platform-managed API keys.
//
// Background: NewAPI's existing /api/token routes are user-scoped — admin
// can't create or list tokens for other users (UserAuth checks id-from-token
// vs New-Api-User header strict equality). The Lurus platform integration
// (see 2l-svc-platform/docs/ADR-newapi-billing-sync.md, step 4e) needs to
// provision a per-platform-account API key without forcing the end user to
// log into NewAPI's web UI.
//
// This file adds the minimum admin-side affordance: a single POST endpoint
// that creates (or returns the existing) API key for a specified user_id,
// keyed by token name for idempotency.
//
// Local override; intentionally narrow surface — no list/delete/rotate yet.
// Add only when platform demands them.
package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// adminUpsertAPIKeyRequest is the POST body for creating/looking-up a
// user-scoped API key by name.
//
// `name` is the idempotency key — admin calling twice with the same name
// returns the existing key. Default is "lurus-platform-default" (the
// Lurus platform's own bookkeeping convention).
type adminUpsertAPIKeyRequest struct {
	Name           string `json:"name"`
	UnlimitedQuota *bool  `json:"unlimited_quota,omitempty"` // default true (platform meters quota itself)
}

// adminAPIKeyResponse is the slim shape returned to admin callers — only
// what the platform actually needs to record. NewAPI's full Token struct
// has many fields irrelevant to upstream consumers (group, model_limits,
// etc.); we intentionally hide them.
type adminAPIKeyResponse struct {
	ID             int    `json:"id"`
	UserID         int    `json:"user_id"`
	Name           string `json:"name"`
	Key            string `json:"key"` // raw "sk-xxx" — caller persists, NewAPI also stores
	UnlimitedQuota bool   `json:"unlimited_quota"`
}

// AdminUpsertUserAPIKey is the handler behind POST /api/user/:id/api-key.
// Admin-only. Idempotent on (user_id, name): returns the existing token
// when one with the same name already exists, otherwise creates a fresh
// "sk-xxx" key.
func AdminUpsertUserAPIKey(c *gin.Context) {
	userID, err := strconv.Atoi(c.Param("id"))
	if err != nil || userID <= 0 {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	var req adminUpsertAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// Empty body is OK — defaults below.
		req = adminUpsertAPIKeyRequest{}
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "lurus-platform-default"
	}
	unlimited := true
	if req.UnlimitedQuota != nil {
		unlimited = *req.UnlimitedQuota
	}

	// Confirm the target user actually exists. Avoid creating orphan tokens.
	if _, err := model.GetUserById(userID, false); err != nil {
		common.ApiErrorI18n(c, i18n.MsgUserNotExists)
		return
	}

	// Idempotent path: search existing tokens for this user, return on name match.
	existing, _, err := model.SearchUserTokens(userID, name, "", 0, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, t := range existing {
		if t.Name == name {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": adminAPIKeyResponse{
					ID:             t.Id,
					UserID:         t.UserId,
					Name:           t.Name,
					Key:            t.Key,
					UnlimitedQuota: t.UnlimitedQuota,
				},
			})
			return
		}
	}

	// Create a new token for the target user.
	rawKey, err := common.GenerateKey()
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgTokenGenerateFailed)
		return
	}
	t := model.Token{
		UserId:         userID,
		Name:           name,
		Key:            rawKey,
		CreatedTime:    common.GetTimestamp(),
		AccessedTime:   common.GetTimestamp(),
		UnlimitedQuota: unlimited,
	}
	if err := t.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.SysLog("admin api key created: user=" + strconv.Itoa(userID) + " name=" + name)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": adminAPIKeyResponse{
			ID:             t.Id,
			UserID:         t.UserId,
			Name:           t.Name,
			Key:            t.Key,
			UnlimitedQuota: t.UnlimitedQuota,
		},
	})
}
