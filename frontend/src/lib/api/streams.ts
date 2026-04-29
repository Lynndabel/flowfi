const DEFAULT_API_BASE_URL = "http://localhost:3001";

function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function getCancelEndpointCandidates(id: string): string[] {
  const baseUrl = getApiBaseUrl();
  const endpoints = new Set<string>();

  if (baseUrl.endsWith("/api/v1") || baseUrl.endsWith("/v1")) {
    endpoints.add(`${baseUrl}/streams/${id}/cancel`);
  } else if (baseUrl.endsWith("/api")) {
    endpoints.add(`${baseUrl}/v1/streams/${id}/cancel`);
  } else {
    endpoints.add(`${baseUrl}/api/v1/streams/${id}/cancel`);
    endpoints.add(`${baseUrl}/v1/streams/${id}/cancel`);
  }

  return [...endpoints];
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };

    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }

    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Ignore invalid JSON and fall back to the status-based message.
  }

  return `Failed to cancel stream (${response.status})`;
}

export async function cancelStream<TStream = unknown>(id: string): Promise<TStream> {
  const endpoints = getCancelEndpointCandidates(id);
  let notFoundError: Error | null = null;

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.ok) {
      if (response.status === 204) {
        return { id, status: "CANCELLED", isActive: false } as TStream;
      }

      return (await response.json()) as TStream;
    }

    if (response.status === 404 && endpoints.length > 1) {
      notFoundError = new Error(`Endpoint not found: ${endpoint}`);
      continue;
    }

    throw new Error(await getErrorMessage(response));
  }

  throw notFoundError ?? new Error("Failed to cancel stream.");
}
