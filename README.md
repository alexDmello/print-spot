# PrintSpot — Self-Service Instant Print Shop (Core MVP)

PrintSpot is an end-to-end self-service print shop system. Customers upload documents, configure print settings, complete payment via UPI/Card, and receive an atomic FIFO queue token. On the shop floor, a persistent Printer Agent automatically dispatches jobs to physical printers and streams live status updates directly to customer screens and the shop Admin panel.

---

## Architecture Overview

```
PrintSpot/
├── backend/       # Express + Socket.IO, PostgreSQL/PGlite, Redis FIFO Queue, Razorpay, 24h Auto-Delete
├── frontend/      # Next.js 14, React 18, Tailwind CSS, Customer Kiosk (Screens 1-7) & Shop Admin Panel
├── agent/         # Shop-Side Persistent Daemon (Windows Print Spooler / CUPS, Auto-Reconnect)
└── docker-compose.yml # Optional production Postgres & Redis services
```

### Key Highlights
1. **Strict FIFO Queue Guarantee**: A job enters the print queue engine **strictly after** payment is confirmed.
2. **Atomic Token Numbering**: Daily atomic token generation per shop (`#1`, `#2`, `#3`...).
3. **Real-time Live Sync**: Socket.IO bi-directional communication between Customer, Shop Admin, and Printer Agent.
4. **Resilient Data Layer**: Works seamlessly out of the box with embedded PGlite & in-memory queue fallback, or with production PostgreSQL & Redis.
5. **24-Hour File Auto-Delete Policy**: Automatically deletes uploaded documents immediately upon customer pickup confirmation OR after 24 hours from creation, whichever is earlier.
6. **Hardware Spooler Integration**: Printer Agent interfaces with local Windows printers via PowerShell (`Get-Printer`) and the print spooler (`pdf-to-printer` / `Start-Process -Verb PrintTo`).

---

## Customer Web App — 7 Core Screens

1. **Landing / Kiosk Station**: Displays shop details, connected hardware status (online/offline), and live per-page rates.
2. **Upload**: Drag-and-drop file upload strictly accepting PDF, JPG, and PNG files. Unsupported formats are rejected with a clear message.
3. **Print Settings**: Real-time copies stepper, Color vs. B&W toggle, Duplex (1-sided / 2-sided), paper size selector (A4, A3, Letter), with live price calculation.
4. **Checkout & Auth**: Minimal Phone-OTP verification tying the order to the customer, order price breakdown, and Razorpay payment sheet (with instant sandbox demo button).
5. **Token Confirmation**: Prominent token badge (`#42`), dynamic estimated wait time, and pickup code preview.
6. **Live Queue Status**: Real-time WebSocket feed: *"Now serving #39 → You: #42"*, with dynamic visual progress stages (*Waiting in Queue* → *Printing Now* → *Ready for Pickup*).
7. **Ready for Pickup**: Full-screen celebration state, 4-digit pickup verification code, counter location instructions, and "Collected" action that triggers immediate document shredding.

---

## Shop-Side Software

### 1. Printer Agent (`agent/`)
- Persistent Node.js daemon running on the shop PC connected to physical/virtual printers.
- Automatically connects and registers with backend via WebSocket (`reconnection: true`).
- Receives dispatched jobs, downloads documents to secure temporary spool, routes to the appropriate printer (Color vs. Mono), and prints with requested copies and duplex settings.
- Reports status back in real-time (`printing`, `ready`, or `failed`).
- If an error occurs (paper jam, out of ink, offline), flags the error to the backend and Admin panel.

### 2. Shop Admin Dashboard (`frontend/src/app/admin`)
- Accessible at `http://localhost:3000/admin`.
- **Live Queue Monitor**: Real-time table of active jobs with live tokens, customer info, page counts, and timers.
- **Manual Overrides**: Move jobs up/down in the queue, cancel jobs, or retry failed jobs.
- **Hardware Telemetry**: Status of connected printers (HP Mono, Canon Color, etc.).
- **Daily Metrics**: Completed jobs today, total revenue (₹), sheets printed, and queue depth.

---

## Quickstart Guide

### 1. Start the Backend
```bash
cd backend
npm install
npm run build
npm run dev   # Runs on http://localhost:5000
```

### 2. Start the Customer Web App & Admin Panel
```bash
cd frontend
npm install
npm run build
npm run dev   # Runs on http://localhost:3000
```

### 3. Start the Printer Agent
```bash
cd agent
npm install
npm run build
npm run dev   # Connects to http://localhost:5000
```

---

## Testing the End-to-End Flow

1. Open `http://localhost:3000` in your browser.
2. Open `http://localhost:3000/admin` in a second browser window to watch the live shop monitor.
3. On the customer page, click **Proceed to Document Upload**.
4. Upload any `.pdf`, `.jpg`, or `.png` file.
5. Configure copies and color preferences, observing the live price calculation.
6. Click **Proceed to Checkout**, enter your 10-digit mobile number, verify OTP (use the generated demo code or `123456`), and click **Pay via UPI/Card**.
7. Confirm your **Token Number** (e.g., `#1`) and view the **Live Queue Status**.
8. Observe the Printer Agent automatically receive the job, transition the state to `printing` (spooling), and then to `ready`.
9. The customer screen advances to **Ready for Pickup** with the 4-digit verification code.
10. Click **I Have Collected My Prints** to confirm pickup and trigger immediate secure file deletion.
