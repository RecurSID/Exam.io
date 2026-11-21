# Security and exam integrity

## Screenshot limitation

Web browsers cannot guarantee screenshot prevention. Operating-system tools, browser extensions, accessibility software, capture cards, virtual machines, and external cameras exist outside the page's control.

The prototype uses practical deterrents:

- Candidate/session watermark across the paper
- Disabled image dragging, selection, context menu, and printing
- Privacy cover when the tab becomes hidden or the window loses focus
- Common print and capture-key interception where the browser exposes the event
- Immediate paper removal when the countdown reaches zero

These controls raise friction but are not a security boundary.

## Stronger production controls

- Render a per-session watermark containing candidate ID and timestamp
- Use short-lived signed image tiles rather than one durable file URL
- Keep the authoritative clock and exam state on the server
- Record focus loss, reconnects, and suspicious event rates
- Use kiosk or managed-device software when screenshot control is mandatory
- Define a clear privacy policy before collecting telemetry
- Never embed answer keys or future papers in frontend code
- Require authenticated administrator accounts and enforce the role in backend policies
- Keep the paper bucket private; never rely on an unlisted admin URL or hidden navigation

