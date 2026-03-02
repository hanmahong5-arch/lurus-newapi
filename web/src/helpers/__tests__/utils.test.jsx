import { Toast } from '@douyinfe/semi-ui';
import {
  showError,
  showWarning,
  showSuccess,
  showInfo,
  isAdmin,
  isRoot,
  getSystemName,
  getLogo,
  getUserIdFromLocalStorage,
  copy,
  removeTrailingSlash,
  verifyJSON,
  verifyJSONPromise,
  selectFilter,
  getTodayStartTimestamp,
  timestamp2string,
  timestamp2string1,
  isDataCrossYear,
  downloadTextAsFile,
  shouldShowPrompt,
  setPromptShown,
  compareObjects,
  generateMessageId,
  getTextContent,
  processThinkTags,
  processIncompleteThinkTags,
  buildMessageContent,
  createMessage,
  hasImageContent,
  formatMessageForAPI,
  isValidMessage,
  getLastUserMessage,
  getLastAssistantMessage,
  getRelativeTime,
  formatDateString,
  formatDateTimeString,
  getTableCompactMode,
  setTableCompactMode,
  calculateModelPrice,
  resetPricingFilters,
} from '../utils';

// Mock @douyinfe/semi-ui Toast
vi.mock('@douyinfe/semi-ui', async () => {
  const actual = await vi.importActual('@douyinfe/semi-ui');
  return {
    ...actual,
    Toast: {
      error: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    },
  };
});

// Mock react-toastify
vi.mock('react-toastify', () => ({
  toast: vi.fn(),
}));

describe('showError', () => {
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    originalLocation = window.location;
    delete window.location;
    window.location = { href: '' };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('handles AxiosError with 401 status: clears user and redirects to /login', () => {
    localStorage.setItem('user', JSON.stringify({ token: 't' }));
    const error = new Error('Unauthorized');
    error.name = 'AxiosError';
    error.response = { status: 401 };

    showError(error);

    expect(localStorage.getItem('user')).toBeNull();
    expect(window.location.href).toBe('/login?expired=true');
  });

  it('handles AxiosError with 429 status: shows rate limit toast', () => {
    const error = new Error('Too Many Requests');
    error.name = 'AxiosError';
    error.response = { status: 429 };

    showError(error);

    expect(Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('请求次数过多'),
    );
  });

  it('handles AxiosError with 500 status: shows server error toast', () => {
    const error = new Error('Internal Server Error');
    error.name = 'AxiosError';
    error.response = { status: 500 };

    showError(error);

    expect(Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('服务器内部错误'),
    );
  });

  it('handles AxiosError with 405 status: shows demo info', () => {
    const error = new Error('Method Not Allowed');
    error.name = 'AxiosError';
    error.response = { status: 405 };

    showError(error);

    expect(Toast.info).toHaveBeenCalledWith(
      expect.stringContaining('演示'),
    );
  });

  it('handles AxiosError with other status: shows error message', () => {
    const error = new Error('Bad Request');
    error.name = 'AxiosError';
    error.response = { status: 400 };

    showError(error);

    expect(Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Bad Request'),
    );
  });

  it('handles regular Error objects: shows error message', () => {
    showError(new Error('Something went wrong'));

    expect(Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('Something went wrong'),
    );
  });

  it('handles plain string errors', () => {
    showError('plain error message');

    expect(Toast.error).toHaveBeenCalledWith(
      expect.stringContaining('plain error message'),
    );
  });
});

describe('showWarning / showSuccess / showInfo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('showWarning calls Toast.warning', () => {
    showWarning('warn msg');
    expect(Toast.warning).toHaveBeenCalledWith('warn msg');
  });

  it('showSuccess calls Toast.success', () => {
    showSuccess('ok msg');
    expect(Toast.success).toHaveBeenCalledWith('ok msg');
  });

  it('showInfo calls Toast.info', () => {
    showInfo('info msg');
    expect(Toast.info).toHaveBeenCalledWith('info msg');
  });
});

describe('isAdmin / isRoot', () => {
  afterEach(() => localStorage.clear());

  it('isAdmin returns true for role >= 10', () => {
    localStorage.setItem('user', JSON.stringify({ role: 10 }));
    expect(isAdmin()).toBe(true);
  });

  it('isAdmin returns false for role < 10', () => {
    localStorage.setItem('user', JSON.stringify({ role: 1 }));
    expect(isAdmin()).toBe(false);
  });

  it('isAdmin returns false when no user', () => {
    expect(isAdmin()).toBe(false);
  });

  it('isRoot returns true for role >= 100', () => {
    localStorage.setItem('user', JSON.stringify({ role: 100 }));
    expect(isRoot()).toBe(true);
  });

  it('isRoot returns false for role < 100', () => {
    localStorage.setItem('user', JSON.stringify({ role: 10 }));
    expect(isRoot()).toBe(false);
  });
});

describe('getSystemName / getLogo', () => {
  afterEach(() => localStorage.clear());

  it('getSystemName returns stored name', () => {
    localStorage.setItem('system_name', 'MyApp');
    expect(getSystemName()).toBe('MyApp');
  });

  it('getSystemName returns default when not set', () => {
    expect(getSystemName()).toBe('New API');
  });

  it('getLogo returns stored logo', () => {
    localStorage.setItem('logo', '/custom-logo.png');
    expect(getLogo()).toBe('/custom-logo.png');
  });

  it('getLogo returns default when not set', () => {
    expect(getLogo()).toBe('/logo.png');
  });
});

describe('getUserIdFromLocalStorage', () => {
  afterEach(() => localStorage.clear());

  it('returns user id when user exists', () => {
    localStorage.setItem('user', JSON.stringify({ id: 42 }));
    expect(getUserIdFromLocalStorage()).toBe(42);
  });

  it('returns -1 when no user', () => {
    expect(getUserIdFromLocalStorage()).toBe(-1);
  });
});

describe('removeTrailingSlash', () => {
  it('removes trailing slash', () => {
    expect(removeTrailingSlash('https://example.com/')).toBe(
      'https://example.com',
    );
  });

  it('returns same string without trailing slash', () => {
    expect(removeTrailingSlash('https://example.com')).toBe(
      'https://example.com',
    );
  });

  it('returns empty string for falsy input', () => {
    expect(removeTrailingSlash('')).toBe('');
    expect(removeTrailingSlash(null)).toBe('');
    expect(removeTrailingSlash(undefined)).toBe('');
  });
});

describe('verifyJSON / verifyJSONPromise', () => {
  it('verifyJSON returns true for valid JSON', () => {
    expect(verifyJSON('{"key":"value"}')).toBe(true);
  });

  it('verifyJSON returns false for invalid JSON', () => {
    expect(verifyJSON('not json')).toBe(false);
  });

  it('verifyJSONPromise resolves for valid JSON', async () => {
    await expect(verifyJSONPromise('{"a":1}')).resolves.toBeUndefined();
  });

  it('verifyJSONPromise rejects for invalid JSON', async () => {
    await expect(verifyJSONPromise('bad')).rejects.toBeDefined();
  });
});

describe('selectFilter', () => {
  it('returns true when no input', () => {
    expect(selectFilter('', { value: 'x', label: 'y' })).toBe(true);
  });

  it('matches by value', () => {
    expect(
      selectFilter('gpt', { value: 'gpt-4', label: 'GPT Model' }),
    ).toBe(true);
  });

  it('matches by label', () => {
    expect(
      selectFilter('model', { value: 'gpt-4', label: 'GPT Model' }),
    ).toBe(true);
  });

  it('returns false when no match', () => {
    expect(
      selectFilter('claude', { value: 'gpt-4', label: 'GPT Model' }),
    ).toBe(false);
  });
});

describe('copy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when navigator.clipboard.writeText succeeds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    const result = await copy('hello');
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to textarea execCommand when clipboard fails and returns true', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('not allowed')),
      },
      writable: true,
      configurable: true,
    });
    // jsdom may not define execCommand; define it so we can spy on it
    if (!document.execCommand) {
      document.execCommand = () => true;
    }
    const mockTextarea = {
      value: '',
      setAttribute: vi.fn(),
      style: {},
      select: vi.fn(),
    };
    const appendChildSpy = vi
      .spyOn(document.body, 'appendChild')
      .mockImplementation(() => mockTextarea);
    const removeChildSpy = vi
      .spyOn(document.body, 'removeChild')
      .mockImplementation(() => mockTextarea);
    const execCommandSpy = vi
      .spyOn(document, 'execCommand')
      .mockReturnValue(true);
    vi.spyOn(document, 'createElement').mockReturnValue(mockTextarea);

    const result = await copy('fallback text');
    expect(result).toBe(true);
    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    execCommandSpy.mockRestore();
  });

  it('returns false when both clipboard and textarea execCommand fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('not allowed')),
      },
      writable: true,
      configurable: true,
    });
    const mockTextarea = {
      value: '',
      setAttribute: vi.fn(),
      style: {},
      select: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockTextarea);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {
      throw new Error('append failed');
    });

    const result = await copy('fail text');
    expect(result).toBe(false);
  });
});

describe('getTodayStartTimestamp', () => {
  it('returns a unix timestamp for today at 00:00:00', () => {
    const ts = getTodayStartTimestamp();
    const date = new Date(ts * 1000);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getMilliseconds()).toBe(0);

    const today = new Date();
    expect(date.getFullYear()).toBe(today.getFullYear());
    expect(date.getMonth()).toBe(today.getMonth());
    expect(date.getDate()).toBe(today.getDate());
  });

  it('returns a number (unix timestamp in seconds)', () => {
    const ts = getTodayStartTimestamp();
    expect(typeof ts).toBe('number');
    // Timestamp should be a reasonable unix second value (> year 2020)
    expect(ts).toBeGreaterThan(1577836800);
  });
});

describe('timestamp2string', () => {
  it('formats a known unix timestamp correctly', () => {
    // 2021-01-01 00:00:00 UTC = 1609459200
    // Use a fixed local offset to avoid timezone issues by constructing expected value from Date
    const ts = 1609459200;
    const result = timestamp2string(ts);
    const d = new Date(ts * 1000);
    const year = d.getFullYear().toString();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    const second = String(d.getSeconds()).padStart(2, '0');
    expect(result).toBe(
      `${year}-${month}-${day} ${hour}:${minute}:${second}`,
    );
  });

  it('zero-pads month, day, hour, minute, second below 10', () => {
    // 2021-01-05 03:04:05 UTC
    const ts = 1609812245;
    const result = timestamp2string(ts);
    // Format is YYYY-MM-DD HH:MM:SS with zero-padding; verify regex pattern
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe('timestamp2string1', () => {
  it('returns month-day hour:00 by default (hour mode, no year)', () => {
    // 2021-06-15 08:00:00 UTC
    const ts = 1623744000;
    const result = timestamp2string1(ts);
    const d = new Date(ts * 1000);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    expect(result).toBe(`${month}-${day} ${hour}:00`);
  });

  it('shows year prefix when showYear is true', () => {
    const ts = 1623744000;
    const result = timestamp2string1(ts, 'hour', true);
    const d = new Date(ts * 1000);
    const year = d.getFullYear();
    expect(result).toMatch(new RegExp(`^${year}-`));
  });

  it('shows date range for week mode', () => {
    const ts = 1623744000;
    const result = timestamp2string1(ts, 'week', false);
    // Should contain " - " indicating a range
    expect(result).toContain(' - ');
  });

  it('shows only date (no time) for day mode', () => {
    const ts = 1623744000;
    const result = timestamp2string1(ts, 'day', false);
    const d = new Date(ts * 1000);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    expect(result).toBe(`${month}-${day}`);
  });
});

describe('isDataCrossYear', () => {
  it('returns false for empty array', () => {
    expect(isDataCrossYear([])).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isDataCrossYear(null)).toBe(false);
    expect(isDataCrossYear(undefined)).toBe(false);
  });

  it('returns false when all timestamps are in the same year', () => {
    // All in 2021
    const ts = [1609459200, 1612137600, 1614556800];
    expect(isDataCrossYear(ts)).toBe(false);
  });

  it('returns true when timestamps span multiple years', () => {
    // 2020 and 2021
    const ts = [1577836800, 1609459200];
    expect(isDataCrossYear(ts)).toBe(true);
  });

  it('returns false for single-element array', () => {
    expect(isDataCrossYear([1609459200])).toBe(false);
  });
});

describe('downloadTextAsFile', () => {
  it('creates a blob URL, anchor element, and triggers click', () => {
    const mockUrl = 'blob:http://localhost/fake-uuid';
    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue(mockUrl);

    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(mockAnchor);

    downloadTextAsFile('hello world', 'test.txt');

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(mockAnchor.href).toBe(mockUrl);
    expect(mockAnchor.download).toBe('test.txt');
    expect(mockAnchor.click).toHaveBeenCalledOnce();

    createObjectURLSpy.mockRestore();
    createElementSpy.mockRestore();
  });
});

describe('shouldShowPrompt / setPromptShown', () => {
  afterEach(() => localStorage.clear());

  it('shouldShowPrompt returns true when key not in localStorage', () => {
    expect(shouldShowPrompt('test-id')).toBe(true);
  });

  it('shouldShowPrompt returns false after setPromptShown is called', () => {
    setPromptShown('test-id');
    expect(shouldShowPrompt('test-id')).toBe(false);
  });

  it('setPromptShown stores the value under prompt-{id}', () => {
    setPromptShown('my-prompt');
    expect(localStorage.getItem('prompt-my-prompt')).toBe('true');
  });

  it('different ids are independent', () => {
    setPromptShown('id-a');
    expect(shouldShowPrompt('id-a')).toBe(false);
    expect(shouldShowPrompt('id-b')).toBe(true);
  });
});

describe('compareObjects', () => {
  it('returns empty array when objects are identical', () => {
    const obj = { a: 1, b: 'hello' };
    expect(compareObjects(obj, { ...obj })).toEqual([]);
  });

  it('detects changed properties', () => {
    const oldObj = { a: 1, b: 2 };
    const newObj = { a: 1, b: 99 };
    const result = compareObjects(oldObj, newObj);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ key: 'b', oldValue: 2, newValue: 99 });
  });

  it('detects multiple changed properties', () => {
    const oldObj = { x: 'foo', y: 10, z: true };
    const newObj = { x: 'bar', y: 10, z: false };
    const result = compareObjects(oldObj, newObj);
    expect(result).toHaveLength(2);
    const keys = result.map((r) => r.key);
    expect(keys).toContain('x');
    expect(keys).toContain('z');
  });

  it('ignores keys present only in newObject', () => {
    const result = compareObjects({ a: 1 }, { a: 1, b: 2 });
    expect(result).toEqual([]);
  });

  it('ignores keys present only in oldObject', () => {
    const result = compareObjects({ a: 1, b: 2 }, { a: 1 });
    expect(result).toEqual([]);
  });
});

describe('generateMessageId', () => {
  it('returns string IDs that increment', () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
    expect(Number(id2)).toBe(Number(id1) + 1);
  });
});

describe('getTextContent', () => {
  it('returns empty string for null or undefined message', () => {
    expect(getTextContent(null)).toBe('');
    expect(getTextContent(undefined)).toBe('');
  });

  it('returns empty string for message without content', () => {
    expect(getTextContent({ role: 'user' })).toBe('');
  });

  it('returns string content directly when content is a string', () => {
    expect(getTextContent({ content: 'hello world' })).toBe('hello world');
  });

  it('extracts text from array content', () => {
    const message = {
      content: [
        { type: 'text', text: 'extracted text' },
        { type: 'image_url', image_url: { url: 'http://example.com/img.png' } },
      ],
    };
    expect(getTextContent(message)).toBe('extracted text');
  });

  it('returns empty string for array content with no text item', () => {
    const message = {
      content: [
        { type: 'image_url', image_url: { url: 'http://example.com/img.png' } },
      ],
    };
    expect(getTextContent(message)).toBe('');
  });

  it('returns empty string when content is non-string non-array', () => {
    expect(getTextContent({ content: 42 })).toBe('');
  });
});

describe('processThinkTags', () => {
  it('returns content unchanged when no think tags present', () => {
    const result = processThinkTags('Hello world', '');
    expect(result.content).toBe('Hello world');
    expect(result.reasoningContent).toBe('');
  });

  it('extracts content inside think tags to reasoningContent', () => {
    const result = processThinkTags('<think>I am thinking</think>Final answer');
    expect(result.content).toBe('Final answer');
    expect(result.reasoningContent).toBe('I am thinking');
  });

  it('removes think tags from content', () => {
    const result = processThinkTags('<think>thoughts</think>response');
    expect(result.content).not.toContain('<think>');
    expect(result.content).not.toContain('</think>');
  });

  it('merges existing reasoningContent with new thoughts using separator', () => {
    const result = processThinkTags(
      '<think>new thought</think>answer',
      'existing reasoning',
    );
    expect(result.reasoningContent).toContain('existing reasoning');
    expect(result.reasoningContent).toContain('new thought');
    expect(result.reasoningContent).toContain('---');
  });

  it('handles multiple think tags', () => {
    const result = processThinkTags(
      '<think>thought1</think>middle<think>thought2</think>end',
    );
    expect(result.content).toBe('middleend');
    expect(result.reasoningContent).toContain('thought1');
    expect(result.reasoningContent).toContain('thought2');
  });

  it('returns original content when no think tag', () => {
    const result = processThinkTags(null);
    expect(result.content).toBeNull();
  });
});

describe('processIncompleteThinkTags', () => {
  it('returns empty content for null/empty input', () => {
    const result = processIncompleteThinkTags('');
    expect(result.content).toBe('');
  });

  it('handles content with no think tags', () => {
    const result = processIncompleteThinkTags('plain text');
    expect(result.content).toBe('plain text');
  });

  it('handles complete think tags same as processThinkTags', () => {
    const result = processIncompleteThinkTags(
      '<think>complete thought</think>answer',
    );
    expect(result.content).toBe('answer');
    expect(result.reasoningContent).toBe('complete thought');
  });

  it('handles unclosed think tag by putting partial content into reasoningContent', () => {
    const result = processIncompleteThinkTags('before<think>partial thinking');
    expect(result.reasoningContent).toContain('partial thinking');
    expect(result.content).toBe('before');
  });

  it('handles unclosed think tag with empty body', () => {
    const result = processIncompleteThinkTags('text<think>');
    expect(result.content).toBe('text');
  });
});

describe('buildMessageContent', () => {
  it('returns empty string when no text and no images', () => {
    expect(buildMessageContent('', [])).toBe('');
    expect(buildMessageContent(null, null)).toBe('');
  });

  it('returns text string when imageEnabled is false', () => {
    expect(buildMessageContent('hello', ['http://img.com/a.png'], false)).toBe(
      'hello',
    );
  });

  it('returns text string when no valid image URLs even with imageEnabled', () => {
    expect(buildMessageContent('hello', ['', '  '], true)).toBe('hello');
  });

  it('returns array with text and image items when imageEnabled and valid URLs', () => {
    const result = buildMessageContent(
      'hello',
      ['http://img.com/a.png'],
      true,
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toEqual({ type: 'text', text: 'hello' });
    expect(result[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'http://img.com/a.png' },
    });
  });

  it('filters out empty image URLs', () => {
    const result = buildMessageContent(
      'text',
      ['http://valid.com/img.png', '', '   '],
      true,
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2); // 1 text + 1 image
  });

  it('returns text string when imageEnabled=true but imageUrls empty', () => {
    expect(buildMessageContent('text only', [], true)).toBe('text only');
  });
});

describe('createMessage', () => {
  it('creates a message with role and content', () => {
    const msg = createMessage('user', 'hello');
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
  });

  it('includes createAt timestamp', () => {
    const before = Date.now();
    const msg = createMessage('user', 'hi');
    const after = Date.now();
    expect(msg.createAt).toBeGreaterThanOrEqual(before);
    expect(msg.createAt).toBeLessThanOrEqual(after);
  });

  it('includes a string id', () => {
    const msg = createMessage('user', 'hi');
    expect(typeof msg.id).toBe('string');
  });

  it('merges options into the message', () => {
    const msg = createMessage('assistant', '', { status: 'loading', foo: 'bar' });
    expect(msg.status).toBe('loading');
    expect(msg.foo).toBe('bar');
  });
});

describe('hasImageContent', () => {
  it('returns false for null or undefined message', () => {
    expect(hasImageContent(null)).toBeFalsy();
    expect(hasImageContent(undefined)).toBeFalsy();
  });

  it('returns false when content is a string', () => {
    expect(hasImageContent({ content: 'text only' })).toBe(false);
  });

  it('returns false when content array has no image_url items', () => {
    expect(
      hasImageContent({ content: [{ type: 'text', text: 'hello' }] }),
    ).toBe(false);
  });

  it('returns true when content array contains an image_url item', () => {
    expect(
      hasImageContent({
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image_url', image_url: { url: 'http://example.com/img.png' } },
        ],
      }),
    ).toBe(true);
  });
});

describe('formatMessageForAPI', () => {
  it('returns null for null/undefined input', () => {
    expect(formatMessageForAPI(null)).toBeNull();
    expect(formatMessageForAPI(undefined)).toBeNull();
  });

  it('returns object with role and content only', () => {
    const msg = {
      role: 'user',
      content: 'hello',
      id: '42',
      createAt: 12345,
      status: 'complete',
    };
    const result = formatMessageForAPI(msg);
    expect(result).toEqual({ role: 'user', content: 'hello' });
    expect(result.id).toBeUndefined();
    expect(result.createAt).toBeUndefined();
  });
});

describe('isValidMessage', () => {
  it('returns false for null/undefined', () => {
    expect(isValidMessage(null)).toBeFalsy();
    expect(isValidMessage(undefined)).toBeFalsy();
  });

  it('returns false when role is missing', () => {
    expect(isValidMessage({ content: 'hello' })).toBeFalsy();
  });

  it('returns true when role and content are present', () => {
    expect(isValidMessage({ role: 'user', content: 'hello' })).toBeTruthy();
  });

  it('returns true when content is empty string', () => {
    expect(isValidMessage({ role: 'assistant', content: '' })).toBeTruthy();
  });

  it('returns false when content is null (not empty string)', () => {
    expect(isValidMessage({ role: 'user', content: null })).toBeFalsy();
  });
});

describe('getLastUserMessage / getLastAssistantMessage', () => {
  const messages = [
    { role: 'user', content: 'first user' },
    { role: 'assistant', content: 'first assistant' },
    { role: 'user', content: 'second user' },
    { role: 'assistant', content: 'second assistant' },
  ];

  it('getLastUserMessage returns the last user message', () => {
    const result = getLastUserMessage(messages);
    expect(result.content).toBe('second user');
  });

  it('getLastAssistantMessage returns the last assistant message', () => {
    const result = getLastAssistantMessage(messages);
    expect(result.content).toBe('second assistant');
  });

  it('getLastUserMessage returns null when no user messages', () => {
    const result = getLastUserMessage([
      { role: 'assistant', content: 'only assistant' },
    ]);
    expect(result).toBeNull();
  });

  it('getLastAssistantMessage returns null when no assistant messages', () => {
    const result = getLastAssistantMessage([
      { role: 'user', content: 'only user' },
    ]);
    expect(result).toBeNull();
  });

  it('getLastUserMessage returns null for non-array input', () => {
    expect(getLastUserMessage(null)).toBeNull();
    expect(getLastUserMessage('not array')).toBeNull();
  });

  it('getLastAssistantMessage returns null for non-array input', () => {
    expect(getLastAssistantMessage(null)).toBeNull();
  });

  it('getLastUserMessage returns null for empty array', () => {
    expect(getLastUserMessage([])).toBeNull();
  });
});

describe('getRelativeTime', () => {
  it('returns empty string for null/undefined input', () => {
    expect(getRelativeTime(null)).toBe('');
    expect(getRelativeTime(undefined)).toBe('');
  });

  it('returns the original string for invalid date', () => {
    expect(getRelativeTime('not-a-date')).toBe('not-a-date');
  });

  it('returns "刚刚" for timestamps less than 60 seconds ago', () => {
    const recent = new Date(Date.now() - 30000).toISOString();
    expect(getRelativeTime(recent)).toBe('刚刚');
  });

  it('returns "X 分钟前" for timestamps 1-59 minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(getRelativeTime(fiveMinutesAgo)).toBe('5 分钟前');
  });

  it('returns "X 小时前" for timestamps 1-23 hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(twoHoursAgo)).toBe('2 小时前');
  });

  it('returns "X 天前" for timestamps 1-6 days ago', () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(getRelativeTime(threeDaysAgo)).toBe('3 天前');
  });

  it('returns "X 周前" for timestamps 1-3 weeks ago', () => {
    const twoWeeksAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(getRelativeTime(twoWeeksAgo)).toBe('2 周前');
  });

  it('returns "X 个月前" for timestamps 1-11 months ago', () => {
    const threeMonthsAgo = new Date(
      Date.now() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(getRelativeTime(threeMonthsAgo)).toBe('3 个月前');
  });

  it('returns "1 年前" for timestamps 1-2 years ago', () => {
    const oneYearAgo = new Date(
      Date.now() - 400 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(getRelativeTime(oneYearAgo)).toBe('1 年前');
  });

  it('returns formatted date string for timestamps more than 2 years ago', () => {
    const threeYearsAgo = new Date(
      Date.now() - 3 * 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const result = getRelativeTime(threeYearsAgo);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns formatted date string for future dates', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const result = getRelativeTime(future);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatDateString', () => {
  it('formats date object as YYYY-MM-DD', () => {
    const d = new Date(2021, 0, 5); // Jan 5, 2021
    expect(formatDateString(d)).toBe('2021-01-05');
  });

  it('zero-pads month and day', () => {
    const d = new Date(2023, 2, 9); // Mar 9, 2023
    expect(formatDateString(d)).toBe('2023-03-09');
  });

  it('handles December correctly', () => {
    const d = new Date(2022, 11, 31); // Dec 31, 2022
    expect(formatDateString(d)).toBe('2022-12-31');
  });
});

describe('formatDateTimeString', () => {
  it('formats date and time as YYYY-MM-DD HH:MM', () => {
    const d = new Date(2021, 0, 5, 8, 3); // Jan 5, 2021 08:03
    expect(formatDateTimeString(d)).toBe('2021-01-05 08:03');
  });

  it('zero-pads hours and minutes', () => {
    const d = new Date(2023, 5, 1, 1, 9); // June 1, 2023 01:09
    expect(formatDateTimeString(d)).toBe('2023-06-01 01:09');
  });
});

describe('getTableCompactMode / setTableCompactMode', () => {
  afterEach(() => localStorage.clear());

  it('returns false by default for any key', () => {
    expect(getTableCompactMode('myTable')).toBe(false);
    expect(getTableCompactMode()).toBe(false);
  });

  it('returns true after setTableCompactMode(true)', () => {
    setTableCompactMode(true, 'myTable');
    expect(getTableCompactMode('myTable')).toBe(true);
  });

  it('returns false after setTableCompactMode(false)', () => {
    setTableCompactMode(true, 'myTable');
    setTableCompactMode(false, 'myTable');
    expect(getTableCompactMode('myTable')).toBe(false);
  });

  it('uses "global" as default key', () => {
    setTableCompactMode(true);
    expect(getTableCompactMode('global')).toBe(true);
    expect(getTableCompactMode()).toBe(true);
  });

  it('different keys are independent', () => {
    setTableCompactMode(true, 'tableA');
    expect(getTableCompactMode('tableA')).toBe(true);
    expect(getTableCompactMode('tableB')).toBe(false);
  });
});

describe('calculateModelPrice', () => {
  const mockDisplayPrice = (usd) => `$${usd.toFixed(4)}`;

  const baseRecord = {
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  };

  const groupRatio = {
    default: 1,
    premium: 2,
  };

  it('calculates per-token price for quota_type=0 with USD currency', () => {
    const result = calculateModelPrice({
      record: baseRecord,
      selectedGroup: 'default',
      groupRatio,
      tokenUnit: 'M',
      displayPrice: mockDisplayPrice,
      currency: 'USD',
    });
    expect(result.isPerToken).toBe(true);
    expect(result.inputPrice).toMatch(/^\$/);
    expect(result.completionPrice).toMatch(/^\$/);
    expect(result.unitLabel).toBe('M');
    expect(result.usedGroup).toBe('default');
    expect(result.usedGroupRatio).toBe(1);
  });

  it('uses K token unit correctly', () => {
    const result = calculateModelPrice({
      record: baseRecord,
      selectedGroup: 'default',
      groupRatio,
      tokenUnit: 'K',
      displayPrice: mockDisplayPrice,
      currency: 'USD',
    });
    expect(result.unitLabel).toBe('K');
    // K unit divides by 1000, so price should be smaller
    const mResult = calculateModelPrice({
      record: baseRecord,
      selectedGroup: 'default',
      groupRatio,
      tokenUnit: 'M',
      displayPrice: mockDisplayPrice,
      currency: 'USD',
    });
    expect(parseFloat(result.inputPrice.slice(1))).toBeLessThan(
      parseFloat(mResult.inputPrice.slice(1)),
    );
  });

  it('uses CNY symbol when currency is CNY', () => {
    const result = calculateModelPrice({
      record: baseRecord,
      selectedGroup: 'default',
      groupRatio,
      tokenUnit: 'M',
      displayPrice: mockDisplayPrice,
      currency: 'CNY',
    });
    expect(result.inputPrice).toMatch(/^¥/);
  });

  it('calculates per-call price for quota_type=1', () => {
    const record = {
      quota_type: 1,
      model_price: '0.05',
      enable_groups: ['default'],
    };
    const result = calculateModelPrice({
      record,
      selectedGroup: 'default',
      groupRatio,
      tokenUnit: 'M',
      displayPrice: mockDisplayPrice,
      currency: 'USD',
    });
    expect(result.isPerToken).toBe(false);
    expect(result.price).toBeDefined();
  });

  it('returns dash placeholder for unknown quota_type', () => {
    const record = {
      quota_type: 99,
      enable_groups: ['default'],
    };
    const result = calculateModelPrice({
      record,
      selectedGroup: 'default',
      groupRatio,
      tokenUnit: 'M',
      displayPrice: mockDisplayPrice,
      currency: 'USD',
    });
    expect(result.price).toBe('-');
    expect(result.isPerToken).toBe(false);
  });

  it('selects min-ratio group when selectedGroup is "all"', () => {
    const result = calculateModelPrice({
      record: {
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
        enable_groups: ['default', 'premium'],
      },
      selectedGroup: 'all',
      groupRatio,
      tokenUnit: 'M',
      displayPrice: mockDisplayPrice,
      currency: 'USD',
    });
    // default ratio=1 < premium ratio=2, so usedGroup should be 'default'
    expect(result.usedGroup).toBe('default');
    expect(result.usedGroupRatio).toBe(1);
  });

  it('falls back to groupRatio=1 when selectedGroup not found and no enable_groups', () => {
    const result = calculateModelPrice({
      record: {
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
        enable_groups: [],
      },
      selectedGroup: 'nonexistent',
      groupRatio,
      tokenUnit: 'M',
      displayPrice: mockDisplayPrice,
      currency: 'USD',
    });
    expect(result.usedGroupRatio).toBe(1);
  });
});

describe('resetPricingFilters', () => {
  it('calls all setter functions with default values', () => {
    const handleChange = vi.fn();
    const setShowWithRecharge = vi.fn();
    const setCurrency = vi.fn();
    const setShowRatio = vi.fn();
    const setViewMode = vi.fn();
    const setFilterGroup = vi.fn();
    const setFilterQuotaType = vi.fn();
    const setFilterEndpointType = vi.fn();
    const setFilterVendor = vi.fn();
    const setFilterTag = vi.fn();
    const setCurrentPage = vi.fn();
    const setTokenUnit = vi.fn();

    resetPricingFilters({
      handleChange,
      setShowWithRecharge,
      setCurrency,
      setShowRatio,
      setViewMode,
      setFilterGroup,
      setFilterQuotaType,
      setFilterEndpointType,
      setFilterVendor,
      setFilterTag,
      setCurrentPage,
      setTokenUnit,
    });

    expect(handleChange).toHaveBeenCalledWith('');
    expect(setShowWithRecharge).toHaveBeenCalledWith(false);
    expect(setCurrency).toHaveBeenCalledWith('USD');
    expect(setShowRatio).toHaveBeenCalledWith(false);
    expect(setViewMode).toHaveBeenCalledWith('card');
    expect(setTokenUnit).toHaveBeenCalledWith('M');
    expect(setFilterGroup).toHaveBeenCalledWith('all');
    expect(setFilterQuotaType).toHaveBeenCalledWith('all');
    expect(setFilterEndpointType).toHaveBeenCalledWith('all');
    expect(setFilterVendor).toHaveBeenCalledWith('all');
    expect(setFilterTag).toHaveBeenCalledWith('all');
    expect(setCurrentPage).toHaveBeenCalledWith(1);
  });

  it('does not throw when setters are omitted (optional chaining)', () => {
    expect(() => resetPricingFilters({})).not.toThrow();
  });

  it('calls only the provided setters and skips undefined ones', () => {
    const setCurrency = vi.fn();
    resetPricingFilters({ setCurrency });
    expect(setCurrency).toHaveBeenCalledWith('USD');
  });
});
