# Frappe HR (frappe/hrms)

An open-source HR and payroll app on Frappe/ERPNext, named in Misthos as a "source of truth for what was actually done" for per-milestone or daily contractor pay.

Sources: GitHub API + README for frappe/hrms; Tameion prior art 05 (Misthos); Frappe REST conventions (see `erpnext-frappe-mcp.md`).
Verified: 2026-09-29

| | |
|---|---|
| Repo | [frappe/hrms](https://github.com/frappe/hrms) (8.8k★) |
| License | GPL-3.0 |
| Language | Python + JS (Frappe) |
| Relation | Split out of ERPNext at v14. Integrates with ERPNext accounting. |

## What it is
13+ modules: Employee lifecycle, Leave and Attendance (geo check-in), **Expense Claims and Advances** with multi-level approval, Performance, **Payroll and Taxation** (salary structures, tax slabs, additional or off-cycle payments), and a mobile app. It uses ERPNext `Timesheet`, `Project`, and `Task` for work tracking.

## API surface an agent would call
Standard Frappe REST (`Authorization: token key:secret`):
- `GET /api/resource/Timesheet?filters=[["docstatus","=",1],["status","=","Submitted"]]`: approved work.
- `GET /api/resource/Employee`, `/api/resource/Salary Slip`, `/api/resource/Expense Claim` (`approval_status`), `/api/resource/Employee Advance`, `/api/resource/Payroll Entry`.
- Submit or cancel via `docstatus` or `frappe.client.submit`. Workflow approvals via `frappe.model.workflow.apply_workflow`.
- Add MCP via **frappe/mcp** in a small custom app (tools like `approved_work_since(date)`, `mark_paid(slip, tx_hash)`).

## Self-host quickly
```bash
git clone https://github.com/frappe/hrms && cd hrms/docker
docker-compose up          # http://localhost:8000  Administrator / admin
```

## Ties
- **Prior art 05 · Misthos** (daily or milestone pay, with arc-escrow), RFB 3 (contractor network), RFB 4 (payroll as an obligation in liquidity planning), RFB 1 (payroll dates drive USYC redemption timing, prior art 02).

## Integration sketch (Arc/Circle)
1. Each contractor is an `Employee` (or Supplier) with an approved Arc address in a custom field (change-tracked).
2. Nightly: the agent pulls **submitted and approved** Timesheets and Expense Claims, computes the amount in USDC base units, dedupes on `(employee, timesheet name)`, and pays via Circle (one idempotency key per timesheet). Batch via a payout contract to save gas (about $0.01 per tx on Arc anyway).
3. On `COMPLETE`: write `tx_hash` to the Timesheet or Expense Claim custom field and create a Journal Entry or Payment Entry in ERPNext. The document (the approved timesheet) is the witness of work, and the chain is the witness of payment.
4. For milestone escrow: approval of a `Task` (status Completed plus reviewer) produces an EIP-712 signature that the escrow contract verifies. The model never gates release.

## Gotchas
- Timesheet approval semantics depend on configured Workflows. Confirm what "approved" means in the instance.
- Payroll (Salary Slip) assumes fiat bank payouts. Treat USDC payout as a custom "mode of payment" with an account mapped to your Arc wallet.
- Currency precision: set USDC to 6 dp (see the ERPNext rounding gotcha).
- GPL-3.0.
