import React from 'react';

const WelcomeGuideView = () => (
  <div className="welcome-guide">
    <h1>Welcome to SectorNet</h1>

    <p><strong>Your data, your communities, your control.</strong></p>

    <p>
      This is a decentralized communication platform built entirely on the Internet Computer.
      It was created with the conviction that your online communities should belong to you,
      not to large corporations.
    </p>
    
    <br />
    <hr />
    <br />
    <h2>Core Principles</h2>
    <ul>
      <li>
        <strong>Absolute Decentralization:</strong> Every piece of data—from your profile to a single
        chat message—is stored on-chain within secure canisters. The entire app runs on the public Internet Computer network.
      </li>
      <li>
        <strong>User Sovereignty:</strong> You are identified by your cryptographic <strong>Principal</strong>,
        not an email address. Your content belongs to you.
      </li>
      <li>
        <strong>Community-Led Governance:</strong> SectorNet is designed to become a <strong>Decentralized Autonomous Organization (DAO)</strong>.
        Its evolution, rules, and moderation are controlled by the community.
      </li>
      <li>
        <strong>Privacy by Design:</strong> The architecture prioritizes user privacy through strong encryption
        and minimal data collection.
      </li>
    </ul>
    <br />
    <hr />
    <br />
    <h2>Security: A Two-Tier Model</h2>
    <p>
      SectorNet offers two distinct security models for chat, allowing you to choose the right balance
      of privacy and scalability for your community.
    </p>

    <h3>Tier 1: High-Security E2EE Mode</h3>
    <ul>
      <li><strong>Best for:</strong> Small, private groups (up to 50 members) who require maximum privacy.</li>
      <li>
        <strong>Guarantee:</strong> Verifiable <strong>End-to-End Encryption</strong>. Content is encrypted
        on your device and can <em>only</em> be decrypted by other members. The platform itself cannot read your messages.
      </li>
      <li>
        <strong>Key Management:</strong> When a member leaves, the group key is compromised. The system will prompt
        a <strong>Moderator</strong> to perform a "Key Rotation," generating a new key for the remaining members
        to ensure forward secrecy.
      </li>
    </ul>

    <h3>Tier 2: Standard Access-Control Mode</h3>
    <ul>
      <li><strong>Best for:</strong> Large public communities.</li>
      <li>
        <strong>Guarantee:</strong> <strong>Policy-Based Privacy</strong>. The canister enforces a strict access control list,
        ensuring only current members can view content. While not E2EE, this model is highly scalable and performant.
      </li>
    </ul>
    <br />
    <hr />
    <br />
    <h2>Governance: The SectorNet DAO</h2>
    <p>
      To ensure the platform remains in the hands of its users, SectorNet is governed by a DAO.
    </p>
    <ul>
      <li>
        <strong>Community Proposals:</strong> Any user can propose changes to the platform, such as new features
        or adjustments to the rules.
      </li>
      <li>
        <strong>Democratic Censorship:</strong> To maintain the health of the public Global Feed, the community can democratically vote
        to remove a Sector's "vetted" status. This process requires a fee to prevent spam, a 2/3 majority vote, and
        a minimum quorum of active users, making it a fair and transparent system.
      </li>
    </ul>

    <h2>Getting Started</h2>
    <p>
      Use the <code>[+]</code> button in the navigator to create your own public or private Sector,
      or to join an existing one using an invite code. Explore the Global Feed, and enjoy your journey in a truly decentralized social network.
    </p>
  </div>
);

export default WelcomeGuideView;
