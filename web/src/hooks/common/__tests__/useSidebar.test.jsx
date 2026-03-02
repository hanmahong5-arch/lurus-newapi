import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_ADMIN_CONFIG, mergeAdminConfig, useSidebar } from '../useSidebar';
import { StatusContext } from '../../../context/Status';

// Mock the helpers module so API.get is fully under test control.
// The mock must be hoisted (vi.mock is hoisted automatically) and must return
// a stable object so that callers importing { API } get the same reference.
vi.mock('../../../helpers', () => ({
  API: { get: vi.fn() },
}));

// Lazily import the mocked API so we can configure return values per test.
const getAPI = async () => {
  const { API } = await import('../../../helpers');
  return API;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal StatusContext value that provides the given
 * SidebarModulesAdmin JSON string (or nothing, when omitted).
 */
function buildStatusValue(sidebarModulesAdmin = undefined) {
  return {
    status: sidebarModulesAdmin !== undefined
      ? { SidebarModulesAdmin: JSON.stringify(sidebarModulesAdmin) }
      : {},
  };
}

/**
 * Create a React wrapper that injects the given status value into StatusContext.
 */
function createWrapper(statusValue) {
  return function Wrapper({ children }) {
    return (
      <StatusContext.Provider value={[statusValue, vi.fn()]}>
        {children}
      </StatusContext.Provider>
    );
  };
}

/**
 * Build the API success response shape that useSidebar expects.
 */
function apiSuccess(sidebarModules) {
  return {
    data: {
      success: true,
      data: { sidebar_modules: sidebarModules },
    },
  };
}

/**
 * Build the API success response with no sidebar_modules field (new user).
 */
function apiSuccessNoModules() {
  return {
    data: {
      success: true,
      data: {},
    },
  };
}

// ---------------------------------------------------------------------------
// Existing tests (preserved)
// ---------------------------------------------------------------------------

describe('DEFAULT_ADMIN_CONFIG', () => {
  it('has expected section keys', () => {
    expect(Object.keys(DEFAULT_ADMIN_CONFIG)).toEqual(
      expect.arrayContaining(['chat', 'console', 'personal', 'admin']),
    );
  });

  it('has enabled=true for all sections', () => {
    Object.values(DEFAULT_ADMIN_CONFIG).forEach((section) => {
      expect(section.enabled).toBe(true);
    });
  });

  it('does not contain subscription in admin section', () => {
    expect(DEFAULT_ADMIN_CONFIG.admin).not.toHaveProperty('subscription');
  });

  it('contains expected admin modules', () => {
    expect(DEFAULT_ADMIN_CONFIG.admin).toEqual(
      expect.objectContaining({
        channel: true,
        models: true,
        deployment: true,
        redemption: true,
        user: true,
        setting: true,
      }),
    );
  });

  it('contains topup in personal section', () => {
    expect(DEFAULT_ADMIN_CONFIG.personal.topup).toBe(true);
  });

  it('contains token in console section', () => {
    expect(DEFAULT_ADMIN_CONFIG.console.token).toBe(true);
  });
});

describe('mergeAdminConfig', () => {
  it('returns default config when input is null', () => {
    const result = mergeAdminConfig(null);
    expect(result).toEqual(DEFAULT_ADMIN_CONFIG);
  });

  it('returns default config when input is undefined', () => {
    const result = mergeAdminConfig(undefined);
    expect(result).toEqual(DEFAULT_ADMIN_CONFIG);
  });

  it('returns default config when input is empty object', () => {
    const result = mergeAdminConfig({});
    expect(result).toEqual(DEFAULT_ADMIN_CONFIG);
  });

  it('merges overrides into defaults', () => {
    const result = mergeAdminConfig({
      admin: { channel: false },
    });
    expect(result.admin.channel).toBe(false);
    expect(result.admin.models).toBe(true);
    expect(result.admin.setting).toBe(true);
  });

  it('preserves new keys from saved config', () => {
    const result = mergeAdminConfig({
      admin: { custom_module: true },
    });
    expect(result.admin.custom_module).toBe(true);
    expect(result.admin.channel).toBe(true);
  });

  it('adds new sections from saved config', () => {
    const result = mergeAdminConfig({
      extra_section: { enabled: true, feature: true },
    });
    expect(result.extra_section).toEqual({ enabled: true, feature: true });
  });

  it('skips non-object section values', () => {
    const result = mergeAdminConfig({
      admin: 'invalid',
    });
    // Should keep admin as default since 'invalid' is not an object
    expect(result.admin.channel).toBe(true);
  });

  it('does not mutate DEFAULT_ADMIN_CONFIG', () => {
    const original = JSON.parse(JSON.stringify(DEFAULT_ADMIN_CONFIG));
    mergeAdminConfig({ admin: { channel: false } });
    expect(DEFAULT_ADMIN_CONFIG).toEqual(original);
  });

  it('overrides section enabled flag', () => {
    const result = mergeAdminConfig({
      chat: { enabled: false },
    });
    expect(result.chat.enabled).toBe(false);
    expect(result.chat.playground).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useSidebar hook — renderHook tests
// ---------------------------------------------------------------------------

describe('useSidebar', () => {
  let API;

  beforeAll(async () => {
    API = await getAPI();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Basic initialization
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    it('starts in loading state and resolves after API call', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const statusValue = buildStatusValue();
      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(statusValue),
      });

      // After async resolution the hook should no longer be loading.
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('returns the expected shape', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current).toMatchObject({
        loading: false,
        adminConfig: expect.any(Object),
        userConfig: expect.any(Object),
        finalConfig: expect.any(Object),
        isModuleVisible: expect.any(Function),
        hasSectionVisibleModules: expect.any(Function),
        getVisibleModules: expect.any(Function),
        refreshUserConfig: expect.any(Function),
      });
    });

    it('derives adminConfig from StatusContext SidebarModulesAdmin', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      // Admin has disabled the channel module.
      const customAdmin = { ...DEFAULT_ADMIN_CONFIG, admin: { ...DEFAULT_ADMIN_CONFIG.admin, channel: false } };
      const statusValue = buildStatusValue(customAdmin);

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(statusValue),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.adminConfig.admin.channel).toBe(false);
      // Other modules remain at their default values.
      expect(result.current.adminConfig.admin.models).toBe(true);
    });

    it('falls back to default adminConfig when SidebarModulesAdmin is absent', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const statusValue = { status: {} };

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(statusValue),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.adminConfig).toEqual(DEFAULT_ADMIN_CONFIG);
    });

    it('falls back to default adminConfig when SidebarModulesAdmin is invalid JSON', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const statusValue = { status: { SidebarModulesAdmin: 'not-json{{{' } };

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(statusValue),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.adminConfig).toEqual(DEFAULT_ADMIN_CONFIG);
    });
  });

  // -------------------------------------------------------------------------
  // User config loading
  // -------------------------------------------------------------------------

  describe('user config loading', () => {
    it('sets userConfig from API response when sidebar_modules is an object', async () => {
      const userModules = {
        chat: { enabled: true, playground: true, chat: false },
        console: { enabled: true },
        personal: { enabled: true },
        admin: { enabled: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.userConfig).toMatchObject({
        chat: expect.objectContaining({ chat: false }),
      });
    });

    it('sets userConfig from API response when sidebar_modules is a JSON string', async () => {
      const userModules = { chat: { enabled: true, chat: false } };
      const response = {
        data: {
          success: true,
          data: { sidebar_modules: JSON.stringify(userModules) },
        },
      };
      API.get.mockResolvedValueOnce(response);

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.userConfig.chat.chat).toBe(false);
    });

    it('generates default userConfig when API returns success but no sidebar_modules', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Default user config should include all admin-enabled sections.
      expect(result.current.userConfig).toHaveProperty('chat');
      expect(result.current.userConfig.chat.enabled).toBe(true);
      expect(result.current.userConfig).toHaveProperty('admin');
    });

    it('generates default userConfig when API call throws', async () => {
      API.get.mockRejectedValueOnce(new Error('network error'));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Should still produce a usable userConfig rather than null.
      expect(result.current.userConfig).not.toBeNull();
      expect(result.current.userConfig).toHaveProperty('chat');
    });
  });

  // -------------------------------------------------------------------------
  // isModuleVisible
  // -------------------------------------------------------------------------

  describe('isModuleVisible', () => {
    it('returns true when admin and user both enable a module', async () => {
      const userModules = {
        chat: { enabled: true, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isModuleVisible('chat', 'playground')).toBe(true);
    });

    it('returns false when admin disables a module', async () => {
      // Admin disables the 'channel' module.
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        admin: { ...DEFAULT_ADMIN_CONFIG.admin, channel: false },
      };
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isModuleVisible('admin', 'channel')).toBe(false);
    });

    it('returns false when user disables a module', async () => {
      // User explicitly sets chat.playground to false.
      const userModules = {
        chat: { enabled: true, playground: false, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isModuleVisible('chat', 'playground')).toBe(false);
    });

    it('returns false for modules in an admin-disabled section', async () => {
      // Admin disables the entire 'console' section.
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        console: { ...DEFAULT_ADMIN_CONFIG.console, enabled: false },
      };
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Individual modules inside a disabled section must not be visible.
      expect(result.current.isModuleVisible('console', 'token')).toBe(false);
    });

    it('returns false for modules in a user-disabled section', async () => {
      // User disables the entire 'personal' section.
      const userModules = {
        chat: { enabled: true, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: false },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isModuleVisible('personal', 'topup')).toBe(false);
    });

    it('returns section enabled state when moduleKey is null', async () => {
      const userModules = {
        chat: { enabled: true, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // No moduleKey passed — should reflect section-level enabled state.
      expect(result.current.isModuleVisible('chat')).toBe(true);
    });

    it('returns false for section-level check when admin disabled the section', async () => {
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        personal: { ...DEFAULT_ADMIN_CONFIG.personal, enabled: false },
      };
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isModuleVisible('personal')).toBe(false);
    });

    it('returns false for unknown section', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isModuleVisible('nonexistent', 'feature')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // hasSectionVisibleModules
  // -------------------------------------------------------------------------

  describe('hasSectionVisibleModules', () => {
    it('returns true when section has at least one visible module', async () => {
      const userModules = {
        chat: { enabled: true, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.hasSectionVisibleModules('chat')).toBe(true);
    });

    it('returns false when section has no visible modules (all disabled by user)', async () => {
      // User disables all modules in 'chat' section (but keeps section enabled).
      const userModules = {
        chat: { enabled: true, playground: false, chat: false },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.hasSectionVisibleModules('chat')).toBe(false);
    });

    it('returns false when section is admin-disabled', async () => {
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        console: { ...DEFAULT_ADMIN_CONFIG.console, enabled: false },
      };
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.hasSectionVisibleModules('console')).toBe(false);
    });

    it('returns false when section is user-disabled', async () => {
      const userModules = {
        chat: { enabled: false, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.hasSectionVisibleModules('chat')).toBe(false);
    });

    it('returns false for unknown section', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.hasSectionVisibleModules('nonexistent')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getVisibleModules
  // -------------------------------------------------------------------------

  describe('getVisibleModules', () => {
    it('returns all visible module keys for an enabled section', async () => {
      const userModules = {
        chat: { enabled: true, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const visible = result.current.getVisibleModules('chat');
      expect(visible).toContain('playground');
      expect(visible).toContain('chat');
      expect(visible).not.toContain('enabled');
    });

    it('excludes modules disabled by the user', async () => {
      const userModules = {
        chat: { enabled: true, playground: true, chat: false },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const visible = result.current.getVisibleModules('chat');
      expect(visible).toContain('playground');
      expect(visible).not.toContain('chat');
    });

    it('excludes modules disabled by the admin', async () => {
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        admin: { ...DEFAULT_ADMIN_CONFIG.admin, redemption: false },
      };
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      const visible = result.current.getVisibleModules('admin');
      expect(visible).not.toContain('redemption');
      expect(visible).toContain('channel');
    });

    it('returns empty array for admin-disabled section', async () => {
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        console: { ...DEFAULT_ADMIN_CONFIG.console, enabled: false },
      };
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.getVisibleModules('console')).toEqual([]);
    });

    it('returns empty array for user-disabled section', async () => {
      const userModules = {
        chat: { enabled: false, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.getVisibleModules('chat')).toEqual([]);
    });

    it('returns empty array for unknown section', async () => {
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.getVisibleModules('nonexistent')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // finalConfig computation
  // -------------------------------------------------------------------------

  describe('finalConfig', () => {
    it('marks section as enabled:false when admin disables it', async () => {
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        personal: { ...DEFAULT_ADMIN_CONFIG.personal, enabled: false },
      };
      API.get.mockResolvedValueOnce(apiSuccessNoModules());

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.finalConfig.personal.enabled).toBe(false);
    });

    it('marks module as false when admin disables it even if user enables it', async () => {
      const adminOverride = {
        ...DEFAULT_ADMIN_CONFIG,
        admin: { ...DEFAULT_ADMIN_CONFIG.admin, models: false },
      };
      // User tries to enable models — admin takes precedence.
      const userModules = {
        chat: { enabled: true, playground: true, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, models: true, channel: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(userModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue(adminOverride)),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.finalConfig.admin.models).toBe(false);
    });

    it('is empty object while userConfig has not yet loaded', () => {
      // Make the API never resolve so userConfig stays null.
      API.get.mockReturnValueOnce(new Promise(() => {}));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      // finalConfig should be empty while userConfig is null.
      expect(result.current.finalConfig).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // refreshUserConfig
  // -------------------------------------------------------------------------

  describe('refreshUserConfig', () => {
    it('re-fetches user config without triggering loading state', async () => {
      // First call during initial load.
      API.get.mockResolvedValueOnce(apiSuccessNoModules());
      // Second call when refreshUserConfig is invoked.
      const refreshedModules = {
        chat: { enabled: true, playground: false, chat: true },
        console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
        personal: { enabled: true, topup: true, personal: true },
        admin: { enabled: true, channel: true, models: true, deployment: true, redemption: true, user: true, setting: true },
      };
      API.get.mockResolvedValueOnce(apiSuccess(refreshedModules));

      const { result } = renderHook(() => useSidebar(), {
        wrapper: createWrapper(buildStatusValue()),
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Invoke refresh — wrap in act so React flushes the state update.
      await act(async () => {
        await result.current.refreshUserConfig();
      });

      await waitFor(() => {
        expect(result.current.userConfig?.chat?.playground).toBe(false);
      });

      // API.get should have been called twice total.
      expect(API.get).toHaveBeenCalledTimes(2);
    });
  });
});
