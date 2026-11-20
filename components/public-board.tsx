import { ArrowUpRight, CircleDot, Drill, Flame, Hammer, Leaf, Package, TentTree, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Category } from "../lib/catalog";

const categoryIcons = { "Power tools": Drill, Garden: Leaf, Kitchen: Flame, Camping: TentTree, "Hand tools": Hammer, Other: Package };

export function ToolIcon({ category }: { category: Category }) {
  const Icon = categoryIcons[category];
  return <span className="toolIcon"><Icon size={22} aria-hidden /></span>;
}

export function Header({ actions }: { actions?: ReactNode }) {
  return <header className="header"><div className="wrap headerInner">
    <Link className="wordmark" href="/"><span className="brandIcon"><Wrench size={20} aria-hidden /></span>Lend<span>Loop</span></Link>
    {actions}
  </div></header>;
}

export function PublicBoard({ signIn, tools, notice }: {
  signIn?: ReactNode;
  tools?: { name: string; category: Category }[];
  notice?: string;
}) {
  return <>
    <Header actions={<span className="headerCaption">The neighborhood tool library</span>} />
    <main className="wrap publicBoard">
      <section className="hero">
        <div>
          <span className="eyebrow"><CircleDot size={14} aria-hidden /> COMMUNITY TOOL SHARING</span>
          <h1>Borrow what you need.<br /><em>Lend what you don’t.</em></h1>
          <p>Find a tool for your next project, or put the ones you already own to work in your neighborhood.</p>
          {signIn}
        </div>
        <div className="heroMark" aria-hidden><span><Wrench /></span><ArrowUpRight className="heroArrow" /></div>
      </section>
      <section aria-labelledby="public-heading">
        <div className="sectionHead">
          <div><h2 id="public-heading">Available to borrow</h2><p>Tools currently on the board.</p></div>
          {tools && <span className="pill">{tools.length} available</span>}
        </div>
        {notice ? <p className="empty" role="status">{notice}</p> :
          tools === undefined ? <p className="empty" role="status">Loading tools…</p> :
          tools.length === 0 ? <p className="empty">No tools have been listed yet. Sign in to add the first one.</p> :
          <ul className="toolGrid publicGrid">{tools.map((tool, index) =>
            <li className="card publicCard" key={index}><ToolIcon category={tool.category} /><div><h3>{tool.name}</h3><p>{tool.category}</p></div></li>)}</ul>}
      </section>
    </main>
  </>;
}
