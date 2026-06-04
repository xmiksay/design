// Mock/fixture data — the dummy values that feed the components on the preview
// pages. Keeping it in one module means a component specimen and the composed
// layout pull from the same source, so the preview always reflects realistic
// content rather than empty shells.

export const nav = {
  brand: "Atelier",
  links: [
    { label: "Overview", href: "index.html", active: true },
    { label: "Components", href: "components.html" },
    { label: "Layout", href: "layout.html" },
    { label: "Pricing", href: "#" },
  ],
};

export const breadcrumb = [
  { label: "Home", href: "#" },
  { label: "Catalog", href: "#" },
  { label: "Field notebooks", href: "#" },
  { label: "No. 04 — Linen" },
];

export const sidebar = [
  { section: "Workspace" },
  { label: "Dashboard", href: "#", active: true },
  { label: "Orders", href: "#" },
  { label: "Inventory", href: "#" },
  { section: "Settings" },
  { label: "Team", href: "#" },
  { label: "Billing", href: "#" },
];

export const tabs = [
  { label: "Description", content: "Hand-bound notebook with a linen cover and 120gsm acid-free paper. Lies flat when open." },
  { label: "Specifications", content: "A5 · 192 pages · dot grid · rounded corners · elastic closure · ribbon marker." },
  { label: "Shipping", content: "Ships in 1–2 business days. Carbon-neutral delivery on every order over $40." },
];

export const accordion = [
  { title: "What paper do you use?", body: "A 120gsm acid-free stock that resists feathering and bleed-through with most fountain-pen inks." },
  { title: "Can I return a notebook?", body: "Unused notebooks can be returned within 30 days for a full refund — no questions asked." },
  { title: "Do you offer custom embossing?", body: "Yes. Orders of 25+ can add a foil-stamped monogram on the cover at checkout." },
];

export const table = {
  caption: "Recent orders",
  columns: [
    { key: "id", label: "Order" },
    { key: "customer", label: "Customer" },
    { key: "status", label: "Status" },
    { key: "total", label: "Total", align: "right" },
  ],
  rows: [
    { id: "#1042", customer: "Mara Ellison", status: "Shipped", total: "$48.00" },
    { id: "#1041", customer: "Tomás Vega", status: "Processing", total: "$120.00" },
    { id: "#1040", customer: "Aiko Tanaka", status: "Delivered", total: "$32.50" },
    { id: "#1039", customer: "Sven Holt", status: "Refunded", total: "$0.00" },
  ],
};

export const list = [
  { title: "Linen field notebook", meta: "In stock", body: "A5 dot grid · 192 pages · ribbon marker." },
  { title: "Brass pen, machined", meta: "Low stock", body: "Solid brass, knurled grip, ships with a fine nib." },
  { title: "Ink — Cedar Black", meta: "In stock", body: "Water-resistant pigment ink, 50ml glass bottle." },
];

export const stats = [
  { label: "Revenue", value: "$48.2k", delta: "12.4%", trend: "up" },
  { label: "Orders", value: "1,284", delta: "3.1%", trend: "up" },
  { label: "Refund rate", value: "1.8%", delta: "0.6%", trend: "down" },
];

export const selectOptions = [
  { value: "a5", label: "A5 — dot grid" },
  { value: "a6", label: "A6 — lined" },
  { value: "b5", label: "B5 — blank" },
];

export const footer = {
  brand: "Atelier",
  note: "© 2026 Atelier Goods. Made in small batches.",
  links: [
    { label: "Catalog", href: "#" },
    { label: "Journal", href: "#" },
    { label: "Contact", href: "#" },
    { label: "Returns", href: "#" },
  ],
};

export const pricing = [
  { plan: "Maker", price: "$0", period: "mo", featured: false, features: ["1 project", "Community support", "Standard tokens"] },
  { plan: "Studio", price: "$18", period: "mo", featured: true, features: ["Unlimited projects", "Live preview", "Custom token themes", "Priority support"] },
  { plan: "Atelier", price: "$60", period: "mo", featured: false, features: ["Everything in Studio", "Shared workspaces", "Audit log", "SSO"] },
];

export const testimonial = {
  quote: "The token pipeline means a single colour change ripples through every component instantly. We re-themed the whole product in an afternoon.",
  author: "Petra Lindqvist",
  role: "Head of Design, Northwind",
};

export const people = [
  { name: "Mara Ellison" },
  { name: "Tomás Vega" },
  { name: "Aiko Tanaka" },
];
