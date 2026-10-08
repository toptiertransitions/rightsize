// Copy for the NonTTTClient "Tips" page (app/(protected)/tips). Edit the
// words here; the components only lay them out. Keep the voice warm and
// direct, and don't use em dashes.

export type PhaseId = "plan" | "sort" | "schedule" | "rehome" | "family" | "moveDay" | "timeline" | "pitfalls";

export interface TipItem {
  question: string;
  answer: string;
  /** Optional in-page link shown under the answer */
  link?: { label: string; href: string };
}

export interface Callout {
  text: string;
}

export interface MoverQuote {
  name: string;
  estimatedTime: string;
  suppliesIncluded: boolean;
  rate: string;
  crew: string;
  travelTimeIncluded: boolean;
  surgePricing: boolean;
  quote: string;
}

export type ValueTier = "$" | "$$" | "$$ to $$$" | "$$ to $$$$" | "$$$$" | "$ to $$" | "$ to $$$";

export interface ChannelRow {
  category: string;
  channel: string;
  why: string;
  tier?: ValueTier;
}

export interface PitfallPair {
  avoid: string;
  instead: string;
}

export interface FamilyPrinciple {
  icon: "patience" | "communicate" | "roles" | "neutral" | "steps";
  label: string;
  line: string;
}

export interface TimelineStep {
  label: string;
  text: string;
}

export interface Phase {
  id: PhaseId;
  /** Filter chip label */
  chip: string;
  badge: string;
  title: string;
  intro: string;
  items: TipItem[];
  callout?: Callout;
}

export const TIPS_SUBTITLE = "Practical guidance for an organized, stress-free senior transition.";
export const TIPS_PHONE_DISPLAY = "312-600-3016";
export const TIPS_PHONE_HREF = "tel:312-600-3016";
export const TIPS_EMAIL = "info@toptiertransitions.com";
export const TIPS_WEBSITE = "https://toptiertransitions.com";
export const TIPS_EMPTY_STATE = `No tips match that search. Try a different word, or call us at ${TIPS_PHONE_DISPLAY}.`;

export const PHASES: Phase[] = [
  {
    id: "plan",
    chip: "Plan",
    badge: "1",
    title: "Getting Oriented",
    intro: "Start with the new space. A thoughtful floor plan makes sorting, rehoming, and move-in calmer.",
    items: [
      { question: "Where do I start?", answer: "Get the floor plan of the new home first. Everything else, including what to keep, sell, and pack, depends on knowing what fits." },
      { question: "What should I measure?", answer: "Key doorways, the main rooms, and your largest furniture pieces. This tells you what will fit and flow before you pack or sell anything." },
      { question: "What if I don't have a floor plan?", answer: "Most communities provide one. If yours doesn't, sketch the space on simple grid paper with approximate measurements." },
      { question: "What else affects the layout?", answer: "Note windows, outlets, and any constraints that could change where furniture can go." },
    ],
    callout: { text: "In your floor plan, sketch where the essentials should go first." },
  },
  {
    id: "sort",
    chip: "Sort",
    badge: "2",
    title: "Sorting and Decision-Making",
    intro: "Sorting isn't about letting go of a lifetime. It's about choosing what moves forward with you.",
    items: [
      { question: "How do I sort without feeling overwhelmed?", answer: "Use four main bins: Keep, Sell, Donate, and Discard. A clear structure makes this step far more manageable than most people expect." },
      { question: "Where should I begin?", answer: "With the easiest areas. Small wins build confidence and momentum." },
      { question: "What about items I can't decide on?", answer: "Create a \"Not Sure Yet\" bin. It relieves the pressure and keeps the sorting moving." },
      { question: "How do I handle sentimental items?", answer: "If the memory is what matters, photograph the item before rehoming it." },
      { question: "Should I do this alone?", answer: "No. Invite supportive helpers to share the emotional load." },
    ],
    callout: { text: "Set a 60-minute timer and focus on one small area at a time." },
  },
  {
    id: "schedule",
    chip: "Schedule",
    badge: "3",
    title: "Scheduling and Logistics",
    intro: "A well-timed plan is the backbone of a seamless move.",
    items: [
      {
        question: "How many mover quotes should I get?",
        answer: "Get several. Quotes can range widely, and movers include different services and materials. Compare what is included, not just the bottom line.",
        link: { label: "See the quote comparison below", href: "#mover-quotes" },
      },
      { question: "What should I book early?", answer: "Elevator access at your community, along with your move date." },
      { question: "What goes in the \"Essentials for First 48 Hours\" box?", answer: "Medications, important documents, and your wallet. Keep it with you instead of putting it on the truck." },
      { question: "How should I pack?", answer: "Room by room, starting in the least-used room, with every box labeled by destination." },
      { question: "What should I do before move day?", answer: "Reconfirm key furniture measurements, notify utilities and services of your move-in date, and photograph your electronics before unplugging them so setup is easy." },
      { question: "What can't movers take?", answer: "Hazardous or restricted items. Ask your mover for their list early so you can plan for those items separately." },
    ],
    callout: { text: "When packing, use consistent labels with color codes for each room." },
  },
  {
    id: "rehome",
    chip: "Rehome",
    badge: "4",
    title: "Rehoming with Respect",
    intro: "Rehoming isn't about letting go. It's about making sure each item continues its story in the right place.",
    items: [
      { question: "Where should I sell my things?", answer: "It depends on the item. Use the channel guide below. For items valued above roughly $25, choose a channel by category. Group lower-value items into sellable lots." },
      { question: "Why group small items into lots?", answer: "Bundled lots sell faster, and individual value is low." },
      { question: "What about clothing?", answer: "Donate non-designer clothing. Resale value is low and the time cost is high. Designer pieces are the exception (see handbags and accessories below)." },
    ],
  },
  {
    id: "family",
    chip: "Family",
    badge: "5",
    title: "Emotional and Family Support",
    intro: "Transitions involve more than logistics. They involve people, emotions, and relationships.",
    items: [
      { question: "How do we keep this from straining the family?", answer: "Honor the senior's preferences and create clear roles so everyone knows how they can help." },
      { question: "What does a good pace look like?", answer: "Patient, and set by the senior. Respect the pace." },
      { question: "How should we talk about it?", answer: "Openly and kindly. Break big decisions into small, manageable steps." },
      { question: "How do we assign roles?", answer: "Delegate thoughtfully, based on who is best suited to each task." },
      { question: "When should we bring in a neutral party?", answer: "When disagreements start to slow things down. A neutral third party helps maintain positive momentum." },
    ],
  },
  {
    id: "moveDay",
    chip: "Move Day",
    badge: "6",
    title: "Move Day and Settling In",
    intro: "A few small habits make move day smoother and the first night easier.",
    items: [],
  },
  {
    id: "timeline",
    chip: "Timeline",
    badge: "7",
    title: "Your 30-Day Timeline",
    intro: "A clear timeline brings peace of mind and removes unnecessary rush.",
    items: [],
    callout: { text: "Moving on Fridays through Sundays can increase mover costs and create complexities at communities." },
  },
  {
    id: "pitfalls",
    chip: "Pitfalls",
    badge: "8",
    title: "Common Pitfalls to Avoid",
    intro: "Most moving stress comes from a few avoidable missteps. Knowing what to watch for helps you stay calm, organized, and in control.",
    items: [],
  },
];

export const MOVER_QUOTES: MoverQuote[] = [
  { name: "Mover A", estimatedTime: "5-8 hours", suppliesIncluded: true, rate: "$150/hr", crew: "2 movers", travelTimeIncluded: false, surgePricing: false, quote: "$1,500" },
  { name: "Mover B", estimatedTime: "4-7 hours", suppliesIncluded: false, rate: "$150/hr", crew: "3 movers", travelTimeIncluded: true, surgePricing: true, quote: "$2,000" },
  { name: "Mover C", estimatedTime: "6-9 hours", suppliesIncluded: true, rate: "$175/hr", crew: "2 movers", travelTimeIncluded: true, surgePricing: false, quote: "$1,650" },
];

export const MOVER_QUOTES_COPY = {
  title: "Mover Quotes Vary Widely",
  subtitle: "Same move, three very different quotes. Compare what's included, not just the total.",
  label: "Illustrative example",
  takeaway: "The lowest quote isn't always the lowest cost. Ask each mover what supplies, travel time, crew size, and surge pricing are included.",
  tip: "Movers include different services and materials in their quotes, so compare closely.",
};

export const REHOMING_CHANNELS: ChannelRow[] = [
  { category: "High-End Furniture (Teak, Mid-Century)", channel: "Luxury Consignment", why: "Buyers expect quality and it's easier to inspect in person.", tier: "$$$$" },
  { category: "Mid-Range Furniture (West Elm)", channel: "Marketplace / OfferUp", why: "Quick local buyers, large audience, fast turnover.", tier: "$$" },
  { category: "Smaller, Not Fragile Collectibles", channel: "eBay", why: "A global market drives bidding.", tier: "$$ to $$$" },
  { category: "Larger, Fragile, or $1k+ Collectibles", channel: "Auction House / Specialty Buyers", why: "Specialist markets understand value, and bidding is competitive.", tier: "$$ to $$$$" },
  { category: "Artwork (Originals)", channel: "Luxury Consignment / Art Auction", why: "Niche market where authentication matters.", tier: "$$ to $$$$" },
  { category: "Jewelry (Fine Gold, Diamonds)", channel: "Jeweler / Auction / Consignment", why: "Requires appraisal and higher trust.", tier: "$$ to $$$$" },
  { category: "Designer Handbags and Accessories (LV, Gucci)", channel: "Fashion Resale", why: "Strong authenticated buyer pool with high resale consistency.", tier: "$$ to $$$$" },
  { category: "Electronics", channel: "Marketplace / Specialized Electronics", why: "Buyers expect detailed condition info, and the category moves fast.", tier: "$ to $$" },
  { category: "Rugs", channel: "Local Consignment / Marketplace", why: "Buyers prefer seeing rugs in person, and size limits the resale market.", tier: "$ to $$$" },
  { category: "Kitchen and Small Appliances", channel: "Estate Sales / Facebook", why: "Bundled lots sell faster, and individual value is low.", tier: "$" },
  { category: "Clothing (Non-Designer)", channel: "Donation", why: "Low resale value and high time cost." },
];

export const REHOMING_FOOTNOTE = "Value tiers are general guidance, not appraisals.";

export const FAMILY_PRINCIPLES: FamilyPrinciple[] = [
  { icon: "patience", label: "Be Patient", line: "Let the senior set the pace." },
  { icon: "communicate", label: "Communicate", line: "Talk openly and kindly." },
  { icon: "roles", label: "Assign Roles", line: "Match each task to the right helper." },
  { icon: "neutral", label: "Bring in a Neutral Party", line: "Keep momentum when opinions differ." },
  { icon: "steps", label: "Break Decisions Into Small Steps", line: "Small choices add up to big progress." },
];

export const MOVE_DAY_LISTS: { title: string; items: string[] }[] = [
  {
    title: "Moving Out",
    items: [
      "Protect floors and hallways.",
      "Reconfirm elevator and building rules.",
      "Set aside your 48-hour essentials bag.",
      "Label \"Do Not Move\" items clearly.",
      "Designate one decision-maker.",
      "Walk through the rooms one final time.",
      "Take photos of empty rooms.",
      "Say goodbye at your own pace.",
    ],
  },
  {
    title: "Settling In",
    items: [
      "Set up the bed first.",
      "Arrange chargers, lamps, and remotes.",
      "Place meaningful items like photos.",
      "Unpack the bathroom essentials.",
      "Clear walking paths for safety.",
      "Adjust lighting and window coverings.",
      "Put everyday items within easy reach.",
      "Take a quiet moment to rest and settle.",
    ],
  },
];

export const TIMELINE_STEPS: TimelineStep[] = [
  { label: "Week 1", text: "Plan, review the floor plan, and measure spaces." },
  { label: "Week 2", text: "Sort and categorize room by room." },
  { label: "Week 3", text: "Pack essentials and coordinate rehoming." },
  { label: "Week 4", text: "Move, unpack, and settle in." },
];

export const PITFALLS: PitfallPair[] = [
  { avoid: "Waiting too late to plan", instead: "Start planning early to set a realistic timeline." },
  { avoid: "Packing before planning the layout", instead: "Review the layout first to see what needs packing." },
  { avoid: "Overestimating what will fit in the new space", instead: "Measure spaces to ensure a good fit before packing or selling." },
  { avoid: "Trying to do everything in a single weekend", instead: "Break the process into steps over several weeks." },
  { avoid: "Making decisions based on emotion", instead: "Balance sentiment with what the senior will realistically use." },
  { avoid: "Leaving key paperwork until the last minute", instead: "Identify, sort, and organize important documents right away." },
];

export const CTA_COPY = {
  heading: "Want a hand with your transition?",
  body: "Our team of professionals is standing by to make your transition as effortless and positive as possible.",
  callLabel: `Call ${TIPS_PHONE_DISPLAY}`,
  websiteLabel: "Visit toptiertransitions.com",
};

/** Every Top Tier Tip on the page, for the "Did you know?" card. */
export const ALL_TOP_TIER_TIPS: string[] = [
  ...PHASES.flatMap((p) => (p.callout ? [p.callout.text] : [])),
  MOVER_QUOTES_COPY.tip,
];
