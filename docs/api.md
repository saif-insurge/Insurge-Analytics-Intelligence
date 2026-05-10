# External API Reference

`https://analytics-intel.insurge.io/api/v1`

Submit audits programmatically from external tools (n8n, custom scripts, integrations).

## Authentication

All `/api/v1/*` endpoints require an API key in the `Authorization` header:

```
Authorization: Bearer ina_live_<random>
```

### Creating an API key

1. Sign in to the web app at `https://analytics-intel.insurge.io`
2. Go to **Settings → API Keys** (or `/settings/api-keys`)
3. Click **+ Create New Key**, give it a name (e.g. `n8n production`)
4. **Copy the plaintext key immediately** — it will not be shown again. Only the prefix (e.g. `ina_live_xY8z…`) is visible afterwards.
5. Store the key in your secret manager / env var

Keys are scoped to your organization. Audits submitted via API show up in the same dashboard as UI-submitted audits.

### Revoking a key

In Settings → API Keys, click **Revoke** next to the key. Any tools using the key immediately stop working. Revocation is soft (the row is kept for audit trail) and irreversible — generate a new key if you need to restore access.

---

## Endpoints

### `POST /api/v1/audits`

Submit one or more URLs for audit.

**Single submit body:**
```json
{
  "url": "https://example.com",
  "notes": "optional context",
  "notifyEmail": "optional@email.com"
}
```

**Bulk submit body (max 100 URLs):**
```json
{
  "urls": ["https://store1.com", "https://store2.com"],
  "notes": "optional",
  "notifyEmail": "optional"
}
```

**Response (single, 201):**
```json
{
  "auditId": "cmoxabc123...",
  "status": "PENDING"
}
```

**Response (bulk, 201):**
```json
{
  "auditIds": ["cmox...", "cmoy..."],
  "count": 2,
  "status": "PENDING"
}
```

**Errors:**
- `400` — invalid body (Zod details in `details`)
- `401` — missing / invalid / revoked API key
- `500` — internal error

---

### `GET /api/v1/audits`

List the org's audits with pagination.

**Query params:**
| Param | Default | Notes |
|---|---|---|
| `page` | `1` | |
| `pageSize` | `25` | max 100 |
| `status` | — | filter by `PENDING` / `RUNNING` / `ANALYZING` / `RENDERING` / `COMPLETE` / `FAILED` |
| `search` | — | case-insensitive substring match on `domain` |

**Response (200):**
```json
{
  "audits": [
    {
      "id": "cmox...",
      "url": "https://example.com",
      "domain": "example.com",
      "status": "COMPLETE",
      "platform": "shopify",
      "overallScore": 78,
      "overallGrade": "B",
      "queuedAt": "2026-05-10T10:00:00Z",
      "startedAt": "2026-05-10T10:00:05Z",
      "completedAt": "2026-05-10T10:02:30Z",
      "failedAt": null,
      "failureReason": null
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 25,
  "totalPages": 2
}
```

---

### `GET /api/v1/audits/:id`

Fetch one audit. Returns full results when `status=COMPLETE`. Returns `404` if the audit doesn't belong to your org.

**Response (200, abbreviated):**
```json
{
  "id": "cmox...",
  "url": "https://example.com",
  "domain": "example.com",
  "status": "COMPLETE",
  "platform": "shopify",
  "platformConfidence": "high",
  "queuedAt": "...",
  "startedAt": "...",
  "completedAt": "...",
  "overallScore": 78,
  "overallGrade": "B",
  "events": [
    {
      "id": "evt_0",
      "name": "view_item",
      "tid": "G-XXXXXXXXXX",
      "transport": "ga4-collect",
      "timestamp": "...",
      "params": {"page_title": "..."},
      "items": [{"item_id": "...", "price": 49.99}]
    }
  ],
  "detectedPlatforms": [
    {"name": "Meta Pixel", "category": "pixel", "requestCount": 12, "detectedEvents": ["PageView", "ViewContent"]}
  ],
  "aiAnalysis": {
    "summary": "...",
    "ga4Present": true,
    "insights": [{"category": "issue", "text": "..."}]
  },
  "funnelLog": [
    {
      "step": 1,
      "name": "home",
      "observation": "Homepage loaded with product grid visible",
      "urlAfter": "https://example.com/",
      "success": true,
      "timestamp": "..."
    }
  ],
  "findings": [
    {
      "id": "...",
      "ruleId": "ga4-add-to-cart-fired",
      "category": "implementation_coverage",
      "severity": "high",
      "status": "failed",
      "title": "add_to_cart event not fired",
      "summary": "...",
      "evidence": {},
      "impact": "...",
      "fix": {"platformSpecific": {"shopify": "..."}}
    }
  ]
}
```

Internal LLM prompts (`funnelLog[].instruction`) are redacted in the API response.

---

## Polling pattern

Audits are async (typically 1-3 min). Submit, then poll until `status` is terminal:

```
POST /api/v1/audits   → {auditId, status: "PENDING"}
GET  /api/v1/audits/{id}  → {status: "RUNNING", ...}
... wait 5s ...
GET  /api/v1/audits/{id}  → {status: "ANALYZING", ...}
... wait 5s ...
GET  /api/v1/audits/{id}  → {status: "COMPLETE", findings: [...], events: [...]}
```

Recommended polling interval: 5-10 seconds. Audits typically complete in 60-180 seconds.

---

## Examples

### curl

```bash
# Submit
curl -X POST https://analytics-intel.insurge.io/api/v1/audits \
  -H "Authorization: Bearer ina_live_<key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Poll
curl https://analytics-intel.insurge.io/api/v1/audits/<auditId> \
  -H "Authorization: Bearer ina_live_<key>"

# List
curl 'https://analytics-intel.insurge.io/api/v1/audits?status=COMPLETE&pageSize=10' \
  -H "Authorization: Bearer ina_live_<key>"
```

### Node.js (fetch)

```js
const KEY = process.env.INSURGE_API_KEY;
const BASE = "https://analytics-intel.insurge.io/api/v1";

// Submit
const submit = await fetch(`${BASE}/audits`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ url: "https://example.com" }),
}).then(r => r.json());

// Poll
async function waitForAudit(id) {
  while (true) {
    const audit = await fetch(`${BASE}/audits/${id}`, {
      headers: { "Authorization": `Bearer ${KEY}` },
    }).then(r => r.json());
    if (["COMPLETE", "FAILED"].includes(audit.status)) return audit;
    await new Promise(r => setTimeout(r, 5000));
  }
}

const result = await waitForAudit(submit.auditId);
console.log(`Score: ${result.overallScore}/100`);
```

### Python

```python
import os, time, requests

KEY = os.environ["INSURGE_API_KEY"]
BASE = "https://analytics-intel.insurge.io/api/v1"
H = {"Authorization": f"Bearer {KEY}"}

# Submit
r = requests.post(f"{BASE}/audits", headers=H, json={"url": "https://example.com"})
audit_id = r.json()["auditId"]

# Poll
while True:
    r = requests.get(f"{BASE}/audits/{audit_id}", headers=H)
    audit = r.json()
    if audit["status"] in ("COMPLETE", "FAILED"):
        break
    time.sleep(5)

print(f"Score: {audit['overallScore']}/100")
```

### n8n

1. Create credentials → Header Auth → Name: `Authorization`, Value: `Bearer ina_live_<key>`
2. HTTP Request node:
   - Method: POST
   - URL: `https://analytics-intel.insurge.io/api/v1/audits`
   - Headers: use the credential
   - Body: `{"url": "{{ $json.url }}"}`
3. Wait node (60s)
4. HTTP Request → GET `https://analytics-intel.insurge.io/api/v1/audits/{{ $json.auditId }}`
5. IF node: branch on `status === "COMPLETE"`, otherwise loop back to Wait

---

## Error responses

All errors return JSON:
```json
{
  "error": "human-readable message",
  "details": { /* optional Zod flatten output */ }
}
```

Status codes:
- `400` — invalid request body
- `401` — missing / invalid / revoked API key
- `404` — audit not found (or not in your org)
- `500` — internal error (worker unreachable, DB down, etc.)

---

## Rate limits

None currently. Be reasonable — each audit runs a real browser for 1-3 minutes and consumes ~1.5GB RAM on the worker. Bulk submissions of 100 URLs queue cleanly via QStash; the worker auto-scales but you'll start seeing tail latency above ~20 concurrent audits.

If you need higher throughput, contact us.
