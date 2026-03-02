import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserContext } from '../context/User';
import { StatusContext } from '../context/Status';

// Default mock user with admin role
export const mockAdminUser = {
  id: 1,
  username: 'admin',
  role: 100,
  token: 'test-token-abc123',
  quota: 500000,
  used_quota: 100000,
  request_count: 42,
};

// Default mock regular user
export const mockRegularUser = {
  id: 2,
  username: 'testuser',
  role: 1,
  token: 'test-token-user',
  quota: 10000,
  used_quota: 5000,
  request_count: 10,
};

// Default mock status
export const mockStatus = {
  top_up_link: 'https://example.com/buy',
  enable_online_topup: false,
  enable_stripe_topup: false,
  min_topup: 1,
  price: 1,
  SidebarModulesAdmin: null,
};

/**
 * Render a component wrapped with all necessary providers.
 *
 * @param {React.ReactElement} ui - Component to render
 * @param {object} options
 * @param {object} options.userState - Override user context state
 * @param {Function} options.userDispatch - Override user dispatch
 * @param {object} options.statusState - Override status context state
 * @param {Function} options.statusDispatch - Override status dispatch
 * @param {string} options.route - Initial route for MemoryRouter
 */
export function renderWithProviders(
  ui,
  {
    userState = { user: mockAdminUser },
    userDispatch = vi.fn(),
    statusState = { status: mockStatus },
    statusDispatch = vi.fn(),
    route = '/',
    ...renderOptions
  } = {},
) {
  function Wrapper({ children }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <StatusContext.Provider value={[statusState, statusDispatch]}>
          <UserContext.Provider value={[userState, userDispatch]}>
            {children}
          </UserContext.Provider>
        </StatusContext.Provider>
      </MemoryRouter>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    userDispatch,
    statusDispatch,
  };
}
