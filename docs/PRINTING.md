# PRINTING.md — Printer Configuration and Management

## Overview

The printing module supports real ESC/POS thermal printers via TCP/IP. It includes a PrinterManager, EscPosRenderer, and TcpTransport for sending bytes to network printers.

## Architecture

```
PrinterManager
  → PrinterProfile (from DB: Printers table)
  → EscPosRenderer (ticket → ESC/POS bytes)
  → TcpTransport (TCP socket → printer)
  → Print routing (product → station → printer)
```

## Printer Configuration

Printers are stored in the `Printers` table. Each printer has:

| Field | Description | Example |
|-------|-------------|---------|
| Name | Display name | "Kitchen Printer" |
| ShareName | TCP host:port | "192.168.1.100:9100" |
| PrinterType | 0=ESC/POS, 1=Text, 2=HTML | 0 |
| CodePage | Character encoding | 857 (Turkish) |
| CharsPerLine | Paper width (58mm=32, 80mm=42) | 42 |

### Adding a Printer

```bash
POST /api/printers
{
  "name": "Kitchen Printer",
  "shareName": "192.168.1.100:9100",
  "printerType": 0,
  "codePage": 857,
  "charsPerLine": 42
}
```

### Test Print

```bash
POST /api/printers/:id/test
```

Sends a test page with printer name, timestamp, and cash drawer open command.

### Check Status

```bash
GET /api/printers/:id/status
```

Returns: `{ online: true, latency: 15, printerName: "Kitchen Printer" }`

## Print Routing

### Bill Printing

```bash
POST /api/print/tickets/:id/send
```

Routes the ticket to the printer configured in `PrinterMaps` for the "Print Bill" job.

### Kitchen Printing

```bash
POST /api/print/tickets/:id/kitchen
```

Routes each order to its kitchen station's printer:
- Pizza → Pizzeria printer
- Burger → Kitchen printer
- Drink → Bar printer

Routing is based on `KitchenStationRouting` → `KitchenStations.PrinterId`.

## ESC/POS Commands Supported

| Command | Bytes | Description |
|---------|-------|-------------|
| Init | ESC @ | Initialize printer |
| Align left | ESC a 0 | Left alignment |
| Align center | ESC a 1 | Center alignment |
| Align right | ESC a 2 | Right alignment |
| Double size | ESC ! 0x30 | Double width + height |
| Normal size | ESC ! 0x00 | Normal size |
| Feed | ESC d N | Feed N lines |
| Cut | GS V 66 0 | Full cut |
| Cash drawer | ESC p 0 25 250 | Open cash drawer |
| Code page | ESC t N | Set character code page |

## TcpTransport

- Default port: 9100 (standard for ESC/POS network printers)
- Timeout: 5 seconds
- Opens TCP connection → sends bytes → closes connection
- Returns: `{ success, bytesSent, error? }`

## Paper Widths

| Width | CharsPerLine | Use |
|-------|-------------|-----|
| 58mm | 32 | Small thermal printers |
| 80mm | 42 | Standard thermal printers |

Configure via `Printers.CharsPerLine`.

## Permissions

| Operation | Permission |
|-----------|------------|
| Print ticket | pos.print |
| Print kitchen order | pos.print |
| Test print | manage.printers |
| Create printer | manage.printers |
| Check status | (any authenticated) |
