/**
 * TEST HELPER - routes calls on the mocked axios client (vi.mock('../api/client')) to handlers.
 *
 *   const api = installFakeApi(apiClient, {
 *     'GET /customers/': () => [],
 *     'POST /customers/': (body) => ({ id: 1, ...body }),
 *     'PATCH /proposals/:id/line-items/:lineId': (body, params) => ({ ...body }),
 *   })
 *   api.calls -> [{ method, path, body, params, query }]
 *
 * A request with no matching route rejects with a 404-shaped axios error.
 */
export function installFakeApi(apiClient, routes) {
  const compiled = Object.entries(routes).map(([key, handler]) => {
    const [method, pattern] = key.split(' ')
    const names = []
    const regex = new RegExp(
      '^' +
        pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, n) => {
          names.push(n)
          return '([^/]+)'
        }) +
        '$',
    )
    return { method, regex, names, handler }
  })
  const calls = []

  const dispatch = (method) => async (url, bodyOrConfig, maybeConfig) => {
    const hasBody = method === 'POST' || method === 'PATCH' || method === 'PUT'
    const body = hasBody ? bodyOrConfig : undefined
    const config = hasBody ? maybeConfig : bodyOrConfig
    const route = compiled.find((r) => r.method === method && r.regex.test(url))
    const entry = { method, path: url, body, query: config?.params }
    calls.push(entry)
    if (!route) {
      const err = new Error(`No fake route for ${method} ${url}`)
      err.response = { status: 404, data: { detail: `Not found: ${method} ${url}` } }
      throw err
    }
    const match = url.match(route.regex)
    const params = Object.fromEntries(route.names.map((n, i) => [n, match[i + 1]]))
    entry.params = params
    const data = await route.handler(body, params, config?.params)
    return { data }
  }

  apiClient.get.mockImplementation(dispatch('GET'))
  apiClient.post.mockImplementation(dispatch('POST'))
  apiClient.patch.mockImplementation(dispatch('PATCH'))
  apiClient.put.mockImplementation(dispatch('PUT'))
  apiClient.delete.mockImplementation(dispatch('DELETE'))
  return {
    calls,
    writes: () => calls.filter((c) => c.method !== 'GET' && !(c.method === 'POST' && c.path === '/rates/resolve')),
  }
}

/** An axios-shaped error for a handler to throw. */
export function httpError(status, detail) {
  const err = new Error(typeof detail === 'string' ? detail : 'error')
  err.response = { status, data: { detail } }
  return err
}
