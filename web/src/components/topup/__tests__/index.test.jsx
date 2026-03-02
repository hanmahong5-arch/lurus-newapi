import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserContext } from '../../../context/User';
import { StatusContext } from '../../../context/Status';
import TopUp from '../index';

// Mock all child components to isolate TopUp logic
vi.mock('../RechargeCard', () => ({
  default: (props) => (
    <div data-testid='recharge-card'>
      <button data-testid='topup-btn' onClick={props.topUp}>
        TopUp
      </button>
      <button data-testid='open-link-btn' onClick={props.openTopUpLink}>
        OpenLink
      </button>
      <input
        data-testid='redemption-input'
        value={props.redemptionCode}
        onChange={(e) => props.setRedemptionCode(e.target.value)}
      />
      <span data-testid='topup-link'>{props.topUpLink}</span>
    </div>
  ),
}));

vi.mock('../InvitationCard', () => ({
  default: (props) => (
    <div data-testid='invitation-card'>
      <span data-testid='aff-link'>{props.affLink}</span>
    </div>
  ),
}));

vi.mock('../modals/TransferModal', () => ({
  default: () => <div data-testid='transfer-modal' />,
}));

vi.mock('../modals/PaymentConfirmModal', () => ({
  default: () => <div data-testid='payment-modal' />,
}));

vi.mock('../modals/TopupHistoryModal', () => ({
  default: () => <div data-testid='history-modal' />,
}));

// Mock API
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../../../helpers', () => ({
  API: {
    get: (...args) => mockGet(...args),
    post: (...args) => mockPost(...args),
  },
  showError: vi.fn(),
  showInfo: vi.fn(),
  showSuccess: vi.fn(),
  renderQuota: (q) => `$${q || 0}`,
  renderQuotaWithAmount: (v) => `$$${v}`,
  copy: vi.fn().mockResolvedValue(true),
  getQuotaPerUnit: () => 500000,
}));

// Mock @douyinfe/semi-ui - provide both component and static methods
vi.mock('@douyinfe/semi-ui', async (importOriginal) => {
  const actual = await importOriginal();
  const ModalMock = (props) => {
    if (!props.visible) return null;
    return (
      <div data-testid='semi-modal'>
        {props.children}
      </div>
    );
  };
  ModalMock.success = vi.fn();
  ModalMock.info = vi.fn();
  ModalMock.warning = vi.fn();
  ModalMock.error = vi.fn();
  ModalMock.confirm = vi.fn();
  ModalMock.destroyAll = vi.fn();

  return {
    ...actual,
    Modal: ModalMock,
    Toast: {
      ...actual.Toast,
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

const mockUser = {
  id: 1,
  username: 'testuser',
  role: 10,
  token: 'tok',
  quota: 50000,
  used_quota: 10000,
  request_count: 42,
};

const mockStatus = {
  top_up_link: 'https://buy.example.com',
  enable_online_topup: false,
  enable_stripe_topup: false,
  min_topup: 1,
  price: 1,
};

function renderTopUp(overrides = {}) {
  const userDispatch = vi.fn();
  return {
    ...render(
      <MemoryRouter>
        <StatusContext.Provider
          value={[
            { status: overrides.status || mockStatus },
            vi.fn(),
          ]}
        >
          <UserContext.Provider
            value={[
              { user: overrides.user || mockUser },
              userDispatch,
            ]}
          >
            <TopUp />
          </UserContext.Provider>
        </StatusContext.Provider>
      </MemoryRouter>,
    ),
    userDispatch,
  };
}

describe('TopUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default API responses
    mockGet.mockImplementation((url) => {
      if (url === '/api/user/self') {
        return Promise.resolve({
          data: { success: true, data: mockUser },
        });
      }
      if (url === '/api/user/aff') {
        return Promise.resolve({
          data: { success: true, data: 'aff123' },
        });
      }
      if (url === '/api/user/topup/info') {
        return Promise.resolve({
          data: {
            success: true,
            message: 'success',
            data: {
              amount_options: [],
              discount: {},
              pay_methods: '[]',
              enable_online_topup: false,
              enable_stripe_topup: false,
              enable_creem_topup: false,
              min_topup: 1,
              creem_products: '[]',
            },
          },
        });
      }
      if (url === '/api/subscription/plans') {
        return Promise.resolve({
          data: { success: true, data: [] },
        });
      }
      if (url === '/api/subscription/self') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              billing_preference: 'subscription_first',
              subscriptions: [],
              all_subscriptions: [],
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders RechargeCard and InvitationCard', async () => {
    renderTopUp();
    await waitFor(() => {
      expect(screen.getByTestId('recharge-card')).toBeInTheDocument();
      expect(screen.getByTestId('invitation-card')).toBeInTheDocument();
    });
  });

  it('renders TransferModal', async () => {
    renderTopUp();
    await waitFor(() => {
      expect(screen.getByTestId('transfer-modal')).toBeInTheDocument();
    });
  });

  it('shows info when redemption code is empty and topUp is called', async () => {
    const { showInfo } = await import('../../../helpers');
    renderTopUp();
    await waitFor(() => {
      expect(screen.getByTestId('topup-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('topup-btn'));
    expect(showInfo).toHaveBeenCalled();
  });

  it('calls API.post on valid redemption code', async () => {
    mockPost.mockResolvedValue({
      data: { success: true, message: 'ok', data: 10000 },
    });

    renderTopUp();
    await waitFor(() => {
      expect(screen.getByTestId('redemption-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('redemption-input'), {
      target: { value: 'VALID-CODE' },
    });

    fireEvent.click(screen.getByTestId('topup-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('recharge-card')).toBeInTheDocument();
    });
  });

  it('shows topUpLink from status', async () => {
    renderTopUp();
    await waitFor(() => {
      const linkEl = screen.getByTestId('topup-link');
      expect(linkEl.textContent).toBe('https://buy.example.com');
    });
  });

  it('fetches invitation link on mount', async () => {
    renderTopUp();
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/user/aff');
    });
  });

  it('sets affLink after fetching', async () => {
    renderTopUp();
    await waitFor(() => {
      const affEl = screen.getByTestId('aff-link');
      expect(affEl.textContent).toContain('aff123');
    });
  });

  it('fetches topup info on mount', async () => {
    renderTopUp();
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/user/topup/info');
    });
  });

  it('fetches subscription plans on mount', async () => {
    renderTopUp();
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/subscription/plans');
    });
  });
});
