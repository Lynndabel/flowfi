/**
 * Integration tests for GET /v1/users/:publicKey/events.
 *
 * Verifies the current activity-history contract used by the frontend:
 * chronological ordering, stream ownership filter, and response shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  prisma: {
    streamEvent: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  sseService: {
    broadcastToStream: vi.fn(),
    broadcastToUser: vi.fn(),
    addClient: vi.fn(),
    removeClient: vi.fn(),
    getClientCount: vi.fn().mockReturnValue(0),
    getActiveIpCount: vi.fn().mockReturnValue(0),
    getPerIpPeakConnections: vi.fn().mockReturnValue(0),
    getMaxConnections: vi.fn().mockReturnValue(10000),
    checkCapacity: vi.fn().mockReturnValue({ allowed: true }),
    isShuttingDown: vi.fn().mockReturnValue(false),
    initRedisSubscription: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/lib/prisma.js', () => ({
  default: mocks.prisma,
  prisma: mocks.prisma,
}));

vi.mock('../../src/services/sse.service.js', () => ({
  sseService: mocks.sseService,
  SSEService: vi.fn(() => mocks.sseService),
}));

vi.mock('../../src/lib/redis.js', () => ({
  cache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    del: vi.fn(),
    getMetadata: vi.fn(),
    getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, hitRate: 0, itemCount: 0 }),
    cleanup: vi.fn(),
  },
  isRedisAvailable: vi.fn().mockReturnValue(false),
  getPublisher: vi.fn().mockReturnValue(null),
  getSubscriber: vi.fn().mockReturnValue(null),
  connectRedis: vi.fn().mockResolvedValue(undefined),
  disconnectRedis: vi.fn().mockResolvedValue(undefined),
}));

import app from '../../src/app.js';

const ADDR = 'GABC123XYZ456DEF789GHI012JKL345MNO678PQR901STU234VWX567YZA';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'evt-1',
    streamId: 1,
    eventType: 'CREATED',
    amount: '1000',
    transactionHash: 'tx-hash',
    ledgerSequence: 1,
    timestamp: 1700000000,
    metadata: null,
    createdAt: new Date(),
    stream: {
      id: 1,
      sender: ADDR,
      recipient: ADDR,
    },
    ...overrides,
  };
}

describe('GET /v1/users/:publicKey/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user event history', async () => {
    const events = [makeEvent({ id: 'a', timestamp: 3 }), makeEvent({ id: 'b', timestamp: 2 })];
    mocks.prisma.streamEvent.findMany.mockResolvedValueOnce(events);

    const res = await request(app).get(`/v1/users/${ADDR}/events`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject([
      { id: 'a', timestamp: 3, eventType: 'CREATED', streamId: 1, transactionHash: 'tx-hash' },
      { id: 'b', timestamp: 2, eventType: 'CREATED', streamId: 1, transactionHash: 'tx-hash' },
    ]);
    expect(res.body[0].createdAt).toEqual(events[0]!.createdAt.toISOString());
    expect(res.body[1].createdAt).toEqual(events[1]!.createdAt.toISOString());

    const callArgs = mocks.prisma.streamEvent.findMany.mock.calls[0]![0] as {
      where: { stream: { OR: Array<{ sender?: string; recipient?: string }> } };
      orderBy: { timestamp: string };
      include: { stream: boolean };
    };
    expect(callArgs.where.stream.OR).toEqual([{ sender: ADDR }, { recipient: ADDR }]);
    expect(callArgs.orderBy).toEqual({ timestamp: 'desc' });
    expect(callArgs.include).toEqual({ stream: true });
  });

  it('returns an empty list when the user has no events', async () => {
    mocks.prisma.streamEvent.findMany.mockResolvedValueOnce([]);

    const res = await request(app).get(`/v1/users/${ADDR}/events`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
