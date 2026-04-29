import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ClaimableAmountService } from '../src/services/claimable.service.js';

describe('ClaimableAmountService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates claimable amount for active stream', () => {
    const service = new ClaimableAmountService({
      cacheTtlMs: 5_000,
    });
    
    vi.setSystemTime(10_000);

    const result = service.getClaimableAmount({
      streamId: 1,
      ratePerSecond: '5',
      depositedAmount: '500',
      withdrawnAmount: '100',
      lastUpdateTime: 7,
      startTime: 0,
      isPaused: false,
      pausedAt: null,
      totalPausedDuration: 0,
      isActive: true,
    });

    // elapsed = 10 - 7 = 3
    // streamed = 3 * 5 = 15
    // remaining = 500 - 100 = 400
    // claimable = min(15, 400) = 15
    expect(result.claimableAmount).toBe('15');
    expect(result.actionable).toBe(true);
    expect(result.cached).toBe(false);
  });

  it('caps claimable amount at remaining balance', () => {
    const service = new ClaimableAmountService({
      cacheTtlMs: 5_000,
    });
    
    vi.setSystemTime(100_000);

    const result = service.getClaimableAmount({
      streamId: 2,
      ratePerSecond: '10',
      depositedAmount: '1000',
      withdrawnAmount: '900',
      lastUpdateTime: 0,
      startTime: 0,
      isPaused: false,
      pausedAt: null,
      totalPausedDuration: 0,
      isActive: true,
    });

    expect(result.claimableAmount).toBe('100');
    expect(result.actionable).toBe(true);
  });

  it('returns zero when stream is inactive', () => {
    const service = new ClaimableAmountService({
      cacheTtlMs: 5_000,
    });
    
    vi.setSystemTime(100_000);

    const result = service.getClaimableAmount({
      streamId: 3,
      ratePerSecond: '10',
      depositedAmount: '100',
      withdrawnAmount: '100',
      lastUpdateTime: 0,
      startTime: 0,
      isPaused: false,
      pausedAt: null,
      totalPausedDuration: 0,
      isActive: false,
    });

    expect(result.claimableAmount).toBe('0');
    expect(result.actionable).toBe(false);
  });

  it('uses cache for repeated request with same stream state + timestamp', () => {
    vi.setSystemTime(5_000);
    const service = new ClaimableAmountService({
      cacheTtlMs: 10_000,
    });

    const input = {
      streamId: 5,
      ratePerSecond: '7',
      depositedAmount: '700',
      withdrawnAmount: '0',
      lastUpdateTime: 0,
      startTime: 0,
      isPaused: false,
      pausedAt: null,
      totalPausedDuration: 0,
      isActive: true,
    };

    const first = service.getClaimableAmount(input, 5);
    const second = service.getClaimableAmount(input, 5);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);

    // Advance local clock beyond cache TTL
    vi.advanceTimersByTime(20_001);
    const third = service.getClaimableAmount(input, 5);
    expect(third.cached).toBe(false);
  });

  it('saturates overflow-safe multiplication to i128 max', () => {
    const i128Max = ((1n << 127n) - 1n).toString();
    vi.setSystemTime(1_000_000);
    const service = new ClaimableAmountService({
      cacheTtlMs: 5_000,
    });

    const result = service.getClaimableAmount({
      streamId: 6,
      ratePerSecond: i128Max,
      depositedAmount: i128Max,
      withdrawnAmount: '0',
      lastUpdateTime: 0,
      startTime: 0,
      isPaused: false,
      pausedAt: null,
      totalPausedDuration: 0,
      isActive: true,
    }, 1000); // 1000 seconds elapsed

    expect(result.claimableAmount).toBe(i128Max);
  });
});
