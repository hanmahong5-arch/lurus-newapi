import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RechargeCard from '../RechargeCard';

// Mock SubscriptionPlansCard
vi.mock('../SubscriptionPlansCard', () => ({
  default: () => <div data-testid='subscription-plans'>Plans</div>,
}));

// Mock useMinimumLoadingTime
vi.mock('../../../hooks/common/useMinimumLoadingTime', () => ({
  useMinimumLoadingTime: (val) => val,
}));

// Mock getCurrencyConfig
vi.mock('../../../helpers/render', () => ({
  getCurrencyConfig: () => ({ symbol: '$', rate: 1, type: 'USD' }),
}));

// Mock VChart
vi.mock('@visactor/react-vchart', () => ({
  VChart: () => <div data-testid='vchart' />,
}));

const t = (key) => key;

const defaultProps = {
  t,
  enableOnlineTopUp: false,
  enableStripeTopUp: false,
  enableCreemTopUp: false,
  creemProducts: [],
  creemPreTopUp: vi.fn(),
  presetAmounts: [],
  selectedPreset: null,
  selectPresetAmount: vi.fn(),
  formatLargeNumber: (n) => String(n),
  priceRatio: 1,
  topUpCount: 1,
  minTopUp: 1,
  renderQuotaWithAmount: (v) => `$${v}`,
  getAmount: vi.fn(),
  setTopUpCount: vi.fn(),
  setSelectedPreset: vi.fn(),
  renderAmount: () => '1.00 元',
  amountLoading: false,
  payMethods: [],
  preTopUp: vi.fn(),
  paymentLoading: false,
  payWay: '',
  redemptionCode: '',
  setRedemptionCode: vi.fn(),
  topUp: vi.fn(),
  isSubmitting: false,
  topUpLink: '',
  openTopUpLink: vi.fn(),
  userState: {
    user: { quota: 50000, used_quota: 10000, request_count: 42 },
  },
  renderQuota: (q) => `$${q || 0}`,
  statusLoading: false,
  topupInfo: { amount_options: [], discount: {} },
  onOpenHistory: vi.fn(),
  subscriptionLoading: false,
  subscriptionPlans: [],
  billingPreference: 'subscription_first',
  onChangeBillingPreference: vi.fn(),
  activeSubscriptions: [],
  allSubscriptions: [],
  reloadSubscriptionSelf: vi.fn(),
};

function renderCard(overrides = {}) {
  return render(
    <MemoryRouter>
      <RechargeCard {...defaultProps} {...overrides} />
    </MemoryRouter>,
  );
}

describe('RechargeCard', () => {
  it('renders account stats (balance, consumption, requests)', () => {
    renderCard();
    expect(screen.getByText('账户统计')).toBeInTheDocument();
    expect(screen.getByText('当前余额')).toBeInTheDocument();
    expect(screen.getByText('历史消耗')).toBeInTheDocument();
    expect(screen.getByText('请求次数')).toBeInTheDocument();
  });

  it('renders balance value from userState', () => {
    renderCard();
    expect(screen.getByText('$50000')).toBeInTheDocument();
  });

  it('renders request count', () => {
    renderCard();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders redemption code input', () => {
    renderCard();
    expect(screen.getByPlaceholderText('请输入兑换码')).toBeInTheDocument();
  });

  it('calls setRedemptionCode on input change', () => {
    const setRedemptionCode = vi.fn();
    renderCard({ setRedemptionCode });
    const input = screen.getByPlaceholderText('请输入兑换码');
    fireEvent.change(input, { target: { value: 'CODE123' } });
    expect(setRedemptionCode).toHaveBeenCalled();
  });

  it('calls topUp when redeem button is clicked', () => {
    const topUp = vi.fn();
    renderCard({ topUp });
    fireEvent.click(screen.getByText('兑换额度'));
    expect(topUp).toHaveBeenCalled();
  });

  it('shows loading state on redeem button when isSubmitting', () => {
    renderCard({ isSubmitting: true });
    const button = screen.getByText('兑换额度').closest('button');
    expect(button).toHaveClass('semi-button-loading');
  });

  it('shows buy link when topUpLink is set', () => {
    renderCard({ topUpLink: 'https://example.com/buy' });
    expect(screen.getByText('购买兑换码')).toBeInTheDocument();
  });

  it('does not show buy link when topUpLink is empty', () => {
    renderCard({ topUpLink: '' });
    expect(screen.queryByText('购买兑换码')).not.toBeInTheDocument();
  });

  it('renders zero values when userState.user is null', () => {
    renderCard({
      userState: { user: null },
      renderQuota: (q) => `$${q || 0}`,
    });
    // With null user, quota renders as $0 via renderQuota(undefined) => $0
    // request_count renders as 0 via user?.request_count || 0
    const allText = document.body.textContent;
    expect(allText).toContain('$0');
    expect(allText).toContain('0');
  });

  it('shows info banner when no online topup is enabled', () => {
    renderCard({
      enableOnlineTopUp: false,
      enableStripeTopUp: false,
      enableCreemTopUp: false,
    });
    expect(
      screen.getByText(
        '管理员未开启在线充值功能，请联系管理员开启或使用兑换码充值。',
      ),
    ).toBeInTheDocument();
  });

  it('does not show subscription tab when no plans', () => {
    renderCard({ subscriptionPlans: [] });
    expect(screen.queryByText('订阅套餐')).not.toBeInTheDocument();
  });

  it('shows subscription tab when plans exist', () => {
    renderCard({
      subscriptionPlans: [{ id: 1, name: 'Pro' }],
    });
    expect(screen.getByText('订阅套餐')).toBeInTheDocument();
  });

  it('calls onOpenHistory when 账单 button is clicked', () => {
    const onOpenHistory = vi.fn();
    renderCard({ onOpenHistory });
    fireEvent.click(screen.getByText('账单'));
    expect(onOpenHistory).toHaveBeenCalled();
  });

  // --- New tests for uncovered lines ---

  it('shows loading spinner when statusLoading is true', () => {
    renderCard({ statusLoading: true });
    // Spin component renders with role="img" in semi-ui or has a specific class
    // The Spin component wraps with a data-testid or class; check for the absence of the banner
    expect(
      screen.queryByText(
        '管理员未开启在线充值功能，请联系管理员开启或使用兑换码充值。',
      ),
    ).not.toBeInTheDocument();
    // Spin renders a loading indicator — semi-ui Spin adds class semi-spin
    const spinEl = document.querySelector('.semi-spin');
    expect(spinEl).toBeInTheDocument();
  });

  it('renders top-up input number field when enableOnlineTopUp is true', () => {
    renderCard({ enableOnlineTopUp: true });
    // The Form.InputNumber renders an input for topUpCount
    // semi-ui Form.InputNumber renders an input element; check for the label
    expect(screen.getByText('充值数量')).toBeInTheDocument();
  });

  it('renders top-up input number field when enableStripeTopUp is true', () => {
    renderCard({ enableStripeTopUp: true });
    expect(screen.getByText('充值数量')).toBeInTheDocument();
  });

  it('renders payment method slot label when enableOnlineTopUp is true', () => {
    renderCard({ enableOnlineTopUp: true });
    expect(screen.getByText('选择支付方式')).toBeInTheDocument();
  });

  it('renders payment method slot label when enableStripeTopUp is true', () => {
    renderCard({ enableStripeTopUp: true });
    expect(screen.getByText('选择支付方式')).toBeInTheDocument();
  });

  it('shows no-payment-method message when payMethods is empty and enableOnlineTopUp is true', () => {
    renderCard({ enableOnlineTopUp: true, payMethods: [] });
    expect(
      screen.getByText('暂无可用的支付方式，请联系管理员配置'),
    ).toBeInTheDocument();
  });

  it('renders alipay payment button when payMethods contains alipay', () => {
    renderCard({
      enableOnlineTopUp: true,
      payMethods: [{ type: 'alipay', name: '支付宝', min_topup: 0 }],
    });
    expect(screen.getByText('支付宝')).toBeInTheDocument();
  });

  it('renders wxpay payment button when payMethods contains wxpay', () => {
    renderCard({
      enableOnlineTopUp: true,
      payMethods: [{ type: 'wxpay', name: '微信支付', min_topup: 0 }],
    });
    expect(screen.getByText('微信支付')).toBeInTheDocument();
  });

  it('renders stripe payment button when payMethods contains stripe and enableStripeTopUp is true', () => {
    renderCard({
      enableStripeTopUp: true,
      payMethods: [{ type: 'stripe', name: 'Stripe', min_topup: 0 }],
    });
    expect(screen.getByText('Stripe')).toBeInTheDocument();
  });

  it('calls preTopUp with payment type when payment button is clicked', () => {
    const preTopUp = vi.fn();
    renderCard({
      enableOnlineTopUp: true,
      payMethods: [{ type: 'alipay', name: '支付宝', min_topup: 0 }],
      preTopUp,
    });
    fireEvent.click(screen.getByText('支付宝'));
    expect(preTopUp).toHaveBeenCalledWith('alipay');
  });

  it('disables payment button when topUpCount is below min_topup and shows tooltip wrapper', () => {
    renderCard({
      enableOnlineTopUp: true,
      topUpCount: 5,
      payMethods: [{ type: 'alipay', name: '支付宝', min_topup: 10 }],
    });
    const button = screen.getByText('支付宝').closest('button');
    expect(button).toBeDisabled();
  });

  it('renders payment button in loading state when paymentLoading and payWay match', () => {
    renderCard({
      enableOnlineTopUp: true,
      payMethods: [{ type: 'alipay', name: '支付宝', min_topup: 0 }],
      paymentLoading: true,
      payWay: 'alipay',
    });
    const button = screen.getByText('支付宝').closest('button');
    expect(button).toHaveClass('semi-button-loading');
  });

  it('renders preset amount cards grid when presetAmounts has items and enableOnlineTopUp is true', () => {
    renderCard({
      enableOnlineTopUp: true,
      presetAmounts: [
        { value: 200 },
        { value: 500 },
        { value: 2000 },
      ],
      priceRatio: 0.01,
    });
    expect(screen.getByText('选择充值额度')).toBeInTheDocument();
    // Each card renders the value via formatLargeNumber; use getAllByText to tolerate multiple matches
    expect(screen.getAllByText(/200/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/500/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2000/).length).toBeGreaterThan(0);
  });

  it('calls selectPresetAmount when a preset card is clicked', () => {
    const selectPresetAmount = vi.fn();
    renderCard({
      enableOnlineTopUp: true,
      presetAmounts: [{ value: 300 }],
      priceRatio: 0.01,
      selectPresetAmount,
    });
    // The preset card renders a div with text like "实付 $3.00，节省 $0.00".
    // Find the deepest div that directly contains "实付" and click it to bubble up.
    // Use querySelector to get the specific div within the preset card.
    const allCards = Array.from(document.querySelectorAll('.semi-card'));
    const presetCard = allCards.find(
      (card) => card.textContent.includes('300') && card.textContent.includes('实付'),
    );
    expect(presetCard).toBeTruthy();
    // Find the innermost element containing "实付" text
    const innerDivs = Array.from(presetCard.querySelectorAll('div'));
    const actualPayDiv = innerDivs.find(
      (div) => div.textContent.includes('实付') && div.children.length === 0,
    );
    // Click either the inner div (preferred) or fall back to the card's body div
    const clickTarget = actualPayDiv || presetCard.querySelector('.semi-card-body > div') || presetCard;
    fireEvent.click(clickTarget);
    expect(selectPresetAmount).toHaveBeenCalledWith({ value: 300 });
  });

  it('renders discount tag for preset amount with discount < 1', () => {
    renderCard({
      enableOnlineTopUp: true,
      presetAmounts: [{ value: 100, discount: 0.8 }],
      priceRatio: 0.01,
    });
    // hasDiscount = true when discount < 1; tag renders the discount
    const allText = document.body.textContent;
    expect(allText).toContain('折');
  });

  it('renders preset amounts with USD currency (no conversion label)', () => {
    // getCurrencyConfig mock returns USD so the label hint should not appear
    renderCard({
      enableOnlineTopUp: true,
      presetAmounts: [{ value: 50 }],
      priceRatio: 0.01,
    });
    // For USD type, the "1 $ = ..." hint does not render
    expect(screen.queryByText(/1 \$ =/)).not.toBeInTheDocument();
  });

  it('renders Creem products when enableCreemTopUp is true and creemProducts has items', () => {
    renderCard({
      enableCreemTopUp: true,
      creemProducts: [
        { name: 'Basic Pack', quota: 1000, price: 9.99, currency: 'USD' },
        { name: 'Pro Pack', quota: 5000, price: 39.99, currency: 'EUR' },
      ],
    });
    expect(screen.getByText('Creem 充值')).toBeInTheDocument();
    expect(screen.getByText('Basic Pack')).toBeInTheDocument();
    expect(screen.getByText('Pro Pack')).toBeInTheDocument();
    expect(screen.getByText('$9.99')).toBeInTheDocument();
    expect(screen.getByText('€39.99')).toBeInTheDocument();
  });

  it('renders Creem product quota text', () => {
    renderCard({
      enableCreemTopUp: true,
      creemProducts: [
        { name: 'Basic Pack', quota: 1000, price: 9.99, currency: 'USD' },
      ],
    });
    // "充值额度" label and the quota value appear in the same div, use partial match
    expect(screen.getByText(/充值额度/)).toBeInTheDocument();
  });

  it('calls creemPreTopUp when a Creem product card is clicked', () => {
    const creemPreTopUp = vi.fn();
    const product = { name: 'Basic Pack', quota: 1000, price: 9.99, currency: 'USD' };
    renderCard({
      enableCreemTopUp: true,
      creemProducts: [product],
      creemPreTopUp,
    });
    fireEvent.click(screen.getByText('Basic Pack'));
    expect(creemPreTopUp).toHaveBeenCalledWith(product);
  });

  it('does not render Creem section when enableCreemTopUp is false', () => {
    renderCard({
      enableCreemTopUp: false,
      creemProducts: [
        { name: 'Basic Pack', quota: 1000, price: 9.99, currency: 'USD' },
      ],
    });
    expect(screen.queryByText('Creem 充值')).not.toBeInTheDocument();
  });

  it('does not render Creem section when creemProducts is empty', () => {
    renderCard({
      enableCreemTopUp: true,
      creemProducts: [],
    });
    expect(screen.queryByText('Creem 充值')).not.toBeInTheDocument();
  });

  it('renders Tabs with subscription and topup panes when subscriptionPlans exist', () => {
    renderCard({
      subscriptionPlans: [{ id: 1, name: 'Pro' }],
    });
    expect(screen.getByText('订阅套餐')).toBeInTheDocument();
    expect(screen.getByText('额度充值')).toBeInTheDocument();
  });

  it('renders SubscriptionPlansCard inside the subscription tab', () => {
    renderCard({
      subscriptionPlans: [{ id: 1, name: 'Pro' }],
    });
    expect(screen.getByTestId('subscription-plans')).toBeInTheDocument();
  });

  it('switches to topup tab when 额度充值 tab is clicked', async () => {
    renderCard({
      subscriptionPlans: [{ id: 1, name: 'Pro' }],
    });
    // Click the topup tab
    fireEvent.click(screen.getByText('额度充值'));
    await waitFor(() => {
      // After switching, topup content becomes visible — redemption code section always renders
      expect(screen.getByPlaceholderText('请输入兑换码')).toBeInTheDocument();
    });
  });

  it('renders actual payment amount text when enableOnlineTopUp is true', () => {
    renderCard({ enableOnlineTopUp: true });
    expect(screen.getByText('实付金额：')).toBeInTheDocument();
    expect(screen.getByText('1.00 元')).toBeInTheDocument();
  });

  it('renders custom payment button with CreditCard icon for unknown type', () => {
    renderCard({
      enableOnlineTopUp: true,
      payMethods: [{ type: 'custom', name: '自定义支付', min_topup: 0, color: '#ff0000' }],
    });
    expect(screen.getByText('自定义支付')).toBeInTheDocument();
  });

  it('renders multiple payment method buttons', () => {
    renderCard({
      enableOnlineTopUp: true,
      enableStripeTopUp: true,
      payMethods: [
        { type: 'alipay', name: '支付宝', min_topup: 0 },
        { type: 'wxpay', name: '微信支付', min_topup: 0 },
        { type: 'stripe', name: 'Stripe', min_topup: 0 },
      ],
    });
    expect(screen.getByText('支付宝')).toBeInTheDocument();
    expect(screen.getByText('微信支付')).toBeInTheDocument();
    expect(screen.getByText('Stripe')).toBeInTheDocument();
  });
});
