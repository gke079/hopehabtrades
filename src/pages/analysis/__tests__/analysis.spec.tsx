import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Analysis from '../analysis';
import { useDigitFeed } from '../use-digit-feed';

jest.mock('../use-digit-feed', () => ({ useDigitFeed: jest.fn() }));
const mockFeed = useDigitFeed as jest.Mock;
const feed = {
    ticks: [{ epoch: 1, quote: 123.4, digit: 0 }, { epoch: 2, quote: 123.45, digit: 5 }],
    precision: 2, status: 'live', error: '',
    markets: [{ symbol: 'R_100', name: 'Volatility 100 Index' }, { symbol: 'R_10', name: 'Volatility 10 Index' }],
};
beforeEach(() => mockFeed.mockReturnValue(feed));

it('selects the over/under barrier from a digit circle and moves the tick pointer', () => {
    const { container } = render(<Analysis />);
    const zero = screen.getByRole('button', { name: /Digit 0,/ });
    fireEvent.click(zero);
    expect(zero).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Over 0')).toBeInTheDocument();
    expect(screen.getByText('Under 0')).toBeInTheDocument();
    expect(container.querySelector('.digit-analysis__pointer')).toHaveStyle('--digit: 5');
    mockFeed.mockReturnValue({ ...feed, ticks: [...feed.ticks, { epoch: 3, quote: 123.48, digit: 8 }] });
    fireEvent.change(screen.getByLabelText('Analysis window'), { target: { value: '100' } });
    expect(container.querySelector('.digit-analysis__pointer')).toHaveStyle('--digit: 8');
});

it('changes the selected volatility and offers reconnect after feed errors', () => {
    mockFeed.mockReturnValue({ ...feed, status: 'error', error: 'Feed interrupted' });
    render(<Analysis />);
    fireEvent.change(screen.getByLabelText('Volatility'), { target: { value: 'R_10' } });
    expect(mockFeed).toHaveBeenLastCalledWith('R_10', 0);
    expect(screen.getByRole('alert')).toHaveTextContent('Feed interrupted');
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(mockFeed).toHaveBeenLastCalledWith('R_10', 1);
});
