import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { authHeader, AuthRedirect, AdminRoute, PrivateRoute } from '../auth';

// Mock history module
vi.mock('../history', () => ({
  history: { location: { pathname: '/test' } },
}));

function renderWithRouter(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path='*' element={ui} />
        <Route path='/login' element={<div data-testid='login-page'>Login</div>} />
        <Route path='/console' element={<div data-testid='console-page'>Console</div>} />
        <Route path='/forbidden' element={<div data-testid='forbidden-page'>Forbidden</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('authHeader', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns Bearer header when user has token', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ token: 'abc123', role: 1 }),
    );
    expect(authHeader()).toEqual({ Authorization: 'Bearer abc123' });
  });

  it('returns empty object when no user in localStorage', () => {
    expect(authHeader()).toEqual({});
  });

  it('returns empty object when user has no token', () => {
    localStorage.setItem('user', JSON.stringify({ role: 1 }));
    expect(authHeader()).toEqual({});
  });
});

describe('AuthRedirect', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('redirects to /console when user is logged in', () => {
    localStorage.setItem('user', JSON.stringify({ token: 't', role: 1 }));
    renderWithRouter(
      <AuthRedirect>
        <div data-testid='child'>Child</div>
      </AuthRedirect>,
      { route: '/some-auth-page' },
    );
    expect(screen.getByTestId('console-page')).toBeInTheDocument();
  });

  it('renders children when no user', () => {
    renderWithRouter(
      <AuthRedirect>
        <div data-testid='child'>Child</div>
      </AuthRedirect>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

describe('PrivateRoute', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('renders children when user exists in localStorage', () => {
    localStorage.setItem('user', JSON.stringify({ token: 't', role: 1 }));
    renderWithRouter(
      <PrivateRoute>
        <div data-testid='protected'>Protected</div>
      </PrivateRoute>,
    );
    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('redirects to /login when no user in localStorage', () => {
    renderWithRouter(
      <PrivateRoute>
        <div data-testid='protected'>Protected</div>
      </PrivateRoute>,
    );
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });
});

describe('AdminRoute', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('redirects to /login when no user', () => {
    renderWithRouter(
      <AdminRoute>
        <div data-testid='admin'>Admin</div>
      </AdminRoute>,
    );
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('redirects to /forbidden when user role < 10', () => {
    localStorage.setItem('user', JSON.stringify({ token: 't', role: 1 }));
    renderWithRouter(
      <AdminRoute>
        <div data-testid='admin'>Admin</div>
      </AdminRoute>,
    );
    expect(screen.getByTestId('forbidden-page')).toBeInTheDocument();
  });

  it('renders children when user role >= 10', () => {
    localStorage.setItem('user', JSON.stringify({ token: 't', role: 10 }));
    renderWithRouter(
      <AdminRoute>
        <div data-testid='admin'>Admin</div>
      </AdminRoute>,
    );
    expect(screen.getByTestId('admin')).toBeInTheDocument();
  });

  it('renders children when user role is 100 (root)', () => {
    localStorage.setItem('user', JSON.stringify({ token: 't', role: 100 }));
    renderWithRouter(
      <AdminRoute>
        <div data-testid='admin'>Admin</div>
      </AdminRoute>,
    );
    expect(screen.getByTestId('admin')).toBeInTheDocument();
  });

  it('redirects to /forbidden when user JSON is invalid', () => {
    localStorage.setItem('user', 'not-valid-json');
    renderWithRouter(
      <AdminRoute>
        <div data-testid='admin'>Admin</div>
      </AdminRoute>,
    );
    expect(screen.getByTestId('forbidden-page')).toBeInTheDocument();
  });
});
