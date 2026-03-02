import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserArea from '../UserArea';

// Mock stringToColor helper
vi.mock('../../../../helpers', () => ({
  stringToColor: () => 'blue',
}));

// Mock SkeletonWrapper
vi.mock('../../components/SkeletonWrapper', () => ({
  default: ({ loading }) =>
    loading ? <div data-testid='skeleton'>Loading...</div> : null,
}));

// Mock Semi UI Dropdown to render menu items inline (jsdom doesn't support portals well)
vi.mock('@douyinfe/semi-ui', async (importOriginal) => {
  const actual = await importOriginal();
  const MockDropdown = ({ render: renderProp, children, ...rest }) => (
    <div data-testid='dropdown-wrapper'>
      {children}
      <div data-testid='dropdown-menu'>{renderProp}</div>
    </div>
  );
  MockDropdown.Menu = ({ children, ...props }) => (
    <div data-testid='dropdown-menu-inner' {...props}>
      {children}
    </div>
  );
  MockDropdown.Item = ({ children, onClick, ...props }) => (
    <div data-testid='dropdown-item' onClick={onClick} role='menuitem'>
      {children}
    </div>
  );

  return {
    ...actual,
    Dropdown: MockDropdown,
  };
});

const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const t = (key) => key;

const defaultUser = {
  id: 1,
  username: 'testuser',
  role: 10,
  token: 'tok',
};

function renderUserArea(overrides = {}) {
  const props = {
    userState: { user: defaultUser },
    isLoading: false,
    isMobile: false,
    isSelfUseMode: false,
    logout: mockLogout,
    navigate: mockNavigate,
    t,
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <UserArea {...props} />
    </MemoryRouter>,
  );
}

describe('UserArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton when loading', () => {
    renderUserArea({ isLoading: true });
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows username when logged in', () => {
    renderUserArea();
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('shows login/register buttons when not logged in', () => {
    renderUserArea({ userState: { user: null } });
    expect(screen.getByText('登录')).toBeInTheDocument();
    expect(screen.getByText('注册')).toBeInTheDocument();
  });

  it('hides register button in self-use mode', () => {
    renderUserArea({ userState: { user: null }, isSelfUseMode: true });
    expect(screen.getByText('登录')).toBeInTheDocument();
    expect(screen.queryByText('注册')).not.toBeInTheDocument();
  });

  it('renders dropdown trigger button with user avatar', () => {
    renderUserArea();
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('dropdown contains 额度管理 menu item', () => {
    renderUserArea();
    expect(screen.getByText('额度管理')).toBeInTheDocument();
  });

  it('dropdown contains 令牌管理 menu item', () => {
    renderUserArea();
    expect(screen.getByText('令牌管理')).toBeInTheDocument();
  });

  it('displays 额度管理 not 钱包管理', () => {
    renderUserArea();
    expect(screen.getByText('额度管理')).toBeInTheDocument();
    expect(screen.queryByText('钱包管理')).not.toBeInTheDocument();
  });

  it('calls navigate to /console/personal when 个人设置 is clicked', () => {
    renderUserArea();
    fireEvent.click(screen.getByText('个人设置'));
    expect(mockNavigate).toHaveBeenCalledWith('/console/personal');
  });

  it('calls navigate to /console/token when 令牌管理 is clicked', () => {
    renderUserArea();
    fireEvent.click(screen.getByText('令牌管理'));
    expect(mockNavigate).toHaveBeenCalledWith('/console/token');
  });

  it('calls navigate to /console/topup when 额度管理 is clicked', () => {
    renderUserArea();
    fireEvent.click(screen.getByText('额度管理'));
    expect(mockNavigate).toHaveBeenCalledWith('/console/topup');
  });

  it('calls logout when 退出 is clicked', () => {
    renderUserArea();
    fireEvent.click(screen.getByText('退出'));
    expect(mockLogout).toHaveBeenCalled();
  });
});
