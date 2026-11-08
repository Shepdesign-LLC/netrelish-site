// The roadmap and changelog, in one place. /roadmap renders it; the tests hold it to the
// scope in the app repo (Shepdesign-LLC/NetRelish, docs/adr/0012-dec-14-scope.md).
// Rule from the voice guide: never claim more than is true. "Now" is what 1.0 ships,
// whether or not it is built yet; the changelog says only what has actually landed.

import { latestTag, released, unreleased } from './changelog.generated';

export interface Entry { name: string; detail: string; pro?: boolean }

export interface Release {
  label: string;
  when: string;
  title: string;
  intro?: string[];
  added?: string[];
  still?: string[];
  removed?: string[];
}

/** 1.0, Mac App Store. */
export const now: Entry[] = [
  { name: 'Bench', detail: 'WebKit browser with a tab strip and address bar. Links that open a new window or popup work' },
  { name: 'Shelf', detail: 'The Jar rail, ⌘1–9 to switch' },
  { name: 'Jars', detail: 'Projects with a shelf life. Each Jar is its own browsing profile: separate cookies, logins, storage' },
  { name: 'Smart Jars', detail: 'Brine (Unsorted), Today, Sealed and Sinking soon fill themselves. ⌃⌘1–4' },
  { name: 'Brine', detail: 'Where idle tabs sink after their Jar’s shelf life. Sunk pages come back where you left them: scroll position and back and forward. Pinned tabs never sink' },
  { name: 'Seal', detail: 'Preserve-and-close: web archive snapshot, full-text indexed, dated' },
  { name: 'Search', detail: 'Full-text over everything sealed, offline. Results open the saved copy' },
  { name: 'Panel', detail: 'Kind, source, sealed date and labels for whatever you’re looking at' },
  { name: 'Reader view', detail: 'The article alone, in clean type. ⌘⇧R' },
  { name: 'Recipes', detail: 'Built-in Recipes that run when you Seal, like Seal & Summarize, on-device. Every Recipe is a Shortcut' },
  { name: 'Shortcuts', detail: 'Capture, seal, jump to a Jar, search' },
  { name: 'Share extension', detail: 'Capture from Safari or any app' },
  { name: 'Reseal & diff', detail: 'Seal a page again and see exactly what changed', pro: true },
  { name: 'Provenance export', detail: 'Timestamped proof that a page said what it said', pro: true },
  { name: 'Pro in the app', detail: 'Buy and restore Pro from the Mac App Store, or with a license key for the direct-download build' },
];

export const next: Entry[] = [
  { name: 'Ask the Pantry', detail: 'Answers over what you’ve preserved, on-device' },
  { name: 'Your own Recipes', detail: 'Record a routine and replay it with ⌘R' },
  { name: 'Split view', detail: 'Two pages side by side on the Bench' },
  { name: 'Content blocker', detail: 'Ad blocking, on or off per Jar' },
  { name: 'Notes', detail: 'Write notes on anything in the Pantry' },
  { name: 'Jar bundles', detail: 'Share a whole Jar as one file', pro: true },
  { name: 'Semantic search', detail: 'Search by meaning. Unlimited Recipes, too', pro: true },
  { name: 'Duo', detail: 'iPhone companion. Capture on the phone, work on the Mac, Handoff between them' },
  { name: 'iCloud Drive sync', detail: 'Between your own devices, for Duo. Your files, your account, never ours' },
  { name: 'Voice notes', detail: 'Dictate into a Jar, transcribed on-device' },
  { name: 'Pickle', detail: 'A developer Jar: local WordPress host on OrbStack (Docker later), GitHub sign-in. Direct-download build only' },
];

export const later: Entry[] = [
  { name: 'Bigger models', detail: 'Larger on-device models, opt-in' },
  { name: 'visionOS', detail: 'The Pantry as a room' },
];

/** Not later. Never, and the architecture depends on it. */
export const never: string[] = [
  'Accounts',
  'Cloud sync through our servers',
  'Browser extensions',
  'An agent that acts in your live tabs',
  'Analytics SDKs in the app',
];

// The previews and what's merged since come from the app repo by themselves
// (scripts/sync-changelog.mjs, run daily by .github/workflows/sync-changelog.yml).
// "still" is the one hand-kept list: what 1.0 needs that hasn't landed yet.
export const changelog: Release[] = [
  {
    label: 'Unreleased',
    when: latestTag ? `Since ${latestTag.replace(/^v/, '')}` : 'In progress for 1.0',
    title: 'Merged, in the next preview',
    added: unreleased.length ? unreleased : undefined,
    still: [
      'A license key for the direct-download build',
      'Sandboxing, privacy manifest and App Store review hardening',
      'Accessibility and onboarding',
    ],
  },
  ...released,
  {
    label: 'Rewrite',
    when: 'September 2026',
    title: 'Native foundation',
    intro: ['NetRelish moved from Tauri to native Swift for the Mac App Store.'],
    added: [
      'Xcode project (SwiftUI + AppKit), with App Store and Developer ID builds',
      'Pantry storage on your Mac, with full-text search',
      'The data model is generated from one design file, with no hand edits',
      'Brand tokens and symbols in Swift; a debug-only Design Kit window',
      'Continuous integration: both builds and the tests run on every pull request and every push to main',
    ],
    removed: ['The Tauri app (kept on the legacy branch)'],
  },
  {
    label: 'Legacy',
    when: 'Aug–Sep 2026',
    title: 'The Tauri app, 0.1.0–0.2.1',
    intro: [
      'The first NetRelish, before the move to native Swift. 0.2.1 is the last Tauri release. It gets no more updates, and nothing installed from it upgrades into the new app. Its NetRelish account and our cloud sync were retired with it. The native app has neither, and never will: there’s no NetRelish account, and nothing syncs through our servers.',
      'The 0.3.0 release on GitHub (October 2026) is the Zest web tools, not the Mac app.',
    ],
  },
];
