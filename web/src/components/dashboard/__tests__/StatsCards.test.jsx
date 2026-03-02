import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatsCards from '../StatsCards';

// Mock VChart to avoid canvas-related issues in jsdom
vi.mock('@visactor/react-vchart', () => ({
  VChart: ({ spec }) => (
    <div data-testid='vchart' data-spec={JSON.stringify(spec)} />
  ),
}));

const CARD_PROPS = {
  bordered: false,
  shadows: 'always',
  headerLine: false,
};

const CHART_CONFIG = {
  mode: 'desktop-browser',
};

const baseTrendSpec = (data, color) => ({
  type: 'line',
  data: [{ values: data || [] }],
  color,
});

const buildGroup = (overrides = {}) => ({
  title: 'Test Group',
  color: 'bg-white',
  items: [
    {
      title: 'Metric A',
      value: '100',
      icon: <span data-testid='icon-a'>A</span>,
      avatarColor: 'blue',
      onClick: vi.fn(),
      trendData: [
        { x: 1, y: 10 },
        { x: 2, y: 20 },
      ],
      trendColor: '#00f',
    },
    ...((overrides.extraItems || [])),
  ],
  ...overrides,
});

function renderComponent(groups, loading = false) {
  return render(
    <MemoryRouter>
      <StatsCards
        groupedStatsData={groups}
        loading={loading}
        getTrendSpec={baseTrendSpec}
        CARD_PROPS={CARD_PROPS}
        CHART_CONFIG={CHART_CONFIG}
      />
    </MemoryRouter>,
  );
}

describe('StatsCards', () => {
  it('renders all groups and items', () => {
    renderComponent([buildGroup(), buildGroup({ title: 'Group 2' })]);
    expect(screen.getAllByTestId('icon-a')).toHaveLength(2);
  });

  it('shows skeleton when loading=true', () => {
    const { container } = renderComponent([buildGroup()], true);
    // Semi Skeleton renders with semi-skeleton class
    expect(
      container.querySelector('.semi-skeleton'),
    ).toBeInTheDocument();
  });

  it('renders VChart when trendData exists and not loading', () => {
    renderComponent([buildGroup()]);
    expect(screen.getByTestId('vchart')).toBeInTheDocument();
  });

  it('does not render VChart when trendData is empty and not loading', () => {
    const group = buildGroup();
    group.items[0].trendData = [];
    renderComponent([group]);
    expect(screen.queryByTestId('vchart')).not.toBeInTheDocument();
  });

  it('calls item.onClick when item is clicked', () => {
    const group = buildGroup();
    renderComponent([group]);
    const metricEl = screen.getByText('Metric A').closest('.cursor-pointer');
    fireEvent.click(metricEl);
    expect(group.items[0].onClick).toHaveBeenCalled();
  });

  it('renders recharge tag for balance item', () => {
    const group = buildGroup();
    group.items[0].title = '当前余额';
    renderComponent([group]);
    expect(screen.getByText('充值')).toBeInTheDocument();
  });
});
