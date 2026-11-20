"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { Bell, Plus, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { categories, conditions, utcDay } from "../lib/catalog";
import type { Category, Condition } from "../lib/catalog";
import { ToolIcon } from "./public-board";

type Tool = FunctionReturnType<typeof api.marketplace.board>[number];
type Loan = FunctionReturnType<typeof api.marketplace.myLoans>["incoming"][number];
type Modal = { type: "listing"; tool?: Tool } | { type: "request" | "remove"; tool: Tool };
const tabs = ["Explore", "My listings", "My requests", "Incoming requests"] as const;
type Tab = (typeof tabs)[number] | "All loans";
const messages = {
  requested: "A neighbor requested", approved: "Request approved for", declined: "Request declined for",
  returned: "Return recorded for", cancelled: "Request cancelled for", overdue: "Return reminder for",
};

function Dialog({ title, children, onClose, busy }: { title: string; children: ReactNode; onClose: () => void; busy: boolean }) {
  return <dialog ref={(node) => { if (node && !node.open) node.showModal(); }}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    aria-labelledby="modal-title">
    <div className="dialogHead"><h2 id="modal-title">{title}</h2>
      <button className="iconButton" aria-label="Close" disabled={busy} onClick={onClose}><X size={21} /></button>
    </div>
    {children}
  </dialog>;
}

export function Dashboard({ admin }: { admin: boolean }) {
  const tools = useQuery(api.marketplace.board);
  const loans = useQuery(api.marketplace.myLoans);
  const inbox = useQuery(api.marketplace.inbox);
  const save = useMutation(api.marketplace.save);
  const remove = useMutation(api.marketplace.remove);
  const request = useMutation(api.marketplace.request);
  const transition = useMutation(api.marketplace.transition);
  const trust = useMutation(api.marketplace.trust);
  const [tab, setTab] = useState<Tab>("Explore");
  const [category, setCategory] = useState<Category | "All categories">("All categories");
  const [modal, setModal] = useState<Modal>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);

  const visibleTools = tools?.filter((tool) => tab === "My listings" ? tool.mine : category === "All categories" || tool.category === category);
  const visibleLoans = tab === "My requests" ? loans?.outgoing : tab === "Incoming requests" ? loans?.incoming : loans?.all;

  function open(next: Modal) {
    setError("");
    setConfirmation("");
    setModal(next);
  }

  async function execute(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setConfirmation("");
    try {
      await operation();
      setModal(undefined);
      setConfirmation(message);
    } catch (caught) {
      setError(caught instanceof ConvexError && typeof caught.data === "string" ? caught.data : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (modal?.type === "listing") {
      void execute(() => save({
        id: modal.tool?.id, name: String(data.get("name")), category: data.get("category") as Category,
        condition: data.get("condition") as Condition, description: String(data.get("description")),
      }), modal.tool ? "Listing updated." : "Tool listed.");
    } else if (modal?.type === "request") {
      void execute(() => request({ tool: modal.tool.id, start: String(data.get("start")), end: String(data.get("end")) }), "Request submitted.");
    }
  }

  function trustAction(lender: Id<"members">, trusted: boolean) {
    return <button className="button secondary small" disabled={busy}
      onClick={() => void execute(() => trust({ lender, trusted: !trusted }), "Lender badge updated.")}>
      {trusted ? "Remove trusted badge" : "Mark trusted lender"}
    </button>;
  }

  function loanActions(loan: Loan) {
    const change = (status: "approved" | "declined" | "cancelled" | "returned") =>
      void execute(() => transition({ id: loan.id, status }), "Request " + status + ".");
    return <div className="actions">
      {loan.isLender && loan.status === "pending" && <>
        <button className="button small" disabled={busy || loan.end < utcDay()} onClick={() => change("approved")}>Approve</button>
        <button className="button secondary small" disabled={busy} onClick={() => change("declined")}>Decline</button>
      </>}
      {loan.isLender && loan.status === "approved" && loan.start <= utcDay() &&
        <button className="button small" disabled={busy} onClick={() => change("returned")}>Mark returned</button>}
      {loan.isBorrower && loan.status === "pending" &&
        <button className="button secondary small" disabled={busy} onClick={() => change("cancelled")}>Cancel request</button>}
      {tab === "All loans" && loan.lender && trustAction(loan.lender, loan.trusted)}
    </div>;
  }

  return <main className="wrap dashboard">
    <div className="sectionHead dashboardHead">
      <div><span className="eyebrow">LENDLOOP WORKSPACE</span><h1>Neighborhood board</h1><p>Find a tool or manage your listings and loans.</p></div>
      <div className="actions">
        <button className="button secondary" aria-expanded={inboxOpen} onClick={() => setInboxOpen(!inboxOpen)}><Bell size={17} /> Activity</button>
        <button className="button" onClick={() => open({ type: "listing" })}><Plus size={19} /> List a tool</button>
      </div>
    </div>
    {inboxOpen && <section className="card inbox" aria-labelledby="inbox-title"><h2 id="inbox-title">Recent notifications</h2>
      {inbox?.length ? <ul>{inbox.map((item) => <li key={item.id}>{messages[item.kind]} <strong>{item.tool}</strong>
        <time dateTime={new Date(item.at).toISOString()}>{new Date(item.at).toLocaleDateString()}</time></li>)}</ul> :
        <p>{inbox ? "No notifications yet." : "Loading notifications…"}</p>}
    </section>}
    <nav className="tabs" aria-label="Tool board views">{(admin ? [...tabs, "All loans" as const] : tabs).map((item) =>
      <button key={item} aria-current={tab === item ? "page" : undefined} onClick={() => { setTab(item); setError(""); setConfirmation(""); }}>{item}</button>)}</nav>
    {confirmation && <p className="feedback" role="status">{confirmation}</p>}
    {!modal && error && <p className="feedback error" role="alert">{error}</p>}
    {(tab === "Explore" || tab === "My listings") ? <section aria-label={tab}>
      {tab === "Explore" && <div className="filters">
        <label htmlFor="category">Category</label>
        <select id="category" value={category} onChange={(event) => setCategory(event.target.value as Category | "All categories")}>
          <option>All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}
        </select>
      </div>}
      {visibleTools?.length ? <ul className="toolGrid">{visibleTools.map((tool) =>
        <li className="card toolCard" key={tool.id}>
          <div className="sectionHead"><ToolIcon category={tool.category} /><span className={"pill " + (tool.available ? "available" : "")}>{tool.available ? "Available" : "On loan"}</span></div>
          <span className="meta">{tool.category} · {tool.condition}</span>
          <h2>{tool.name}</h2><p>{tool.description}</p>
          {tool.trusted && <span className="trusted"><ShieldCheck size={15} /> Trusted lender</span>}
          <div className="actions cardActions">
            {tool.mine ? <button className="button secondary small" onClick={() => open({ type: "listing", tool })}>Edit listing</button> :
              <button className="button small" onClick={() => open({ type: "request", tool })}>Request dates</button>}
            {tool.lender && trustAction(tool.lender, tool.trusted)}
            {(tool.mine || admin) && <button className="button quiet small" onClick={() => open({ type: "remove", tool })}>Remove</button>}
          </div>
        </li>)}</ul> : <p className="empty">{visibleTools ? "No listings in this view." : "Loading tools…"}</p>}
    </section> : <section aria-label={tab}>
      {visibleLoans?.length ? <ul className="loanList">{visibleLoans.map((loan) =>
        <li className="card loan" key={loan.id}>
          <div><h2>{loan.name}</h2><p>{loan.start} to {loan.end} · UTC</p>
            <p className="meta">{loan.lastReminderDay ? "Last reminder " + loan.lastReminderDay + " · " : ""}
              {loan.delivery === "failed" ? "Notification delivery failed" : loan.delivery === "logged" ? "Notification logged" : "Notification queued"}</p></div>
          <div className="loanSide"><span className={"pill status " + loan.status}>{loan.status}</span>{loanActions(loan)}</div>
        </li>)}</ul> : <p className="empty">{visibleLoans ? "No loans in this view." : "Loading loans…"}</p>}
    </section>}
    {modal && <Dialog title={modal.type === "listing" ? modal.tool ? "Edit listing" : "List a tool" : modal.type === "request" ? "Request " + modal.tool.name : "Remove listing"}
      busy={busy} onClose={() => { setModal(undefined); setError(""); }}>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {modal.type === "remove" ?
        <><p>Remove {modal.tool.name} from the board? Pending requests will be cancelled. Active loans can still be returned.</p>
          <button className="button danger" disabled={busy} onClick={() => void execute(() => remove({ id: modal.tool.id }), "Listing removed.")}>Remove listing</button></> :
        <form className="form" onSubmit={submit}>
          {modal.type === "listing" ? <>
            <label>Tool name<input name="name" required minLength={2} maxLength={80} defaultValue={modal.tool?.name} /></label>
            <div className="formRow">
              <label>Category<select name="category" defaultValue={modal.tool?.category}>{categories.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label>Condition<select name="condition" defaultValue={modal.tool?.condition}>{conditions.map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <label>Description<textarea name="description" required minLength={2} maxLength={280} rows={4} defaultValue={modal.tool?.description} /></label>
          </> : <>
            <p>The lender will review your request. Dates are inclusive and use UTC.</p>
            <div className="formRow">
              <label>First day<input type="date" name="start" min={utcDay()} required /></label>
              <label>Return by<input type="date" name="end" min={utcDay()} required /></label>
            </div>
          </>}
          <button className="button" disabled={busy}>{busy ? "Saving…" : modal.type === "listing" ? "Save listing" : "Send request"}</button>
        </form>}
    </Dialog>}
  </main>;
}
