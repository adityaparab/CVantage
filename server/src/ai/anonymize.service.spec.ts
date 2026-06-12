import { AnonymizationService } from './anonymize.service';

describe('AnonymizationService', () => {
  let svc: AnonymizationService;

  beforeEach(() => {
    svc = new AnonymizationService();
  });

  // ─── anonymizeText ────────────────────────────────────────────────────────

  describe('anonymizeText – emails', () => {
    it('replaces an email with a format-preserving token', () => {
      const { text } = svc.anonymizeText('Contact: john.doe+work@example.com');
      expect(text).not.toContain('john.doe+work@example.com');
      expect(text).toMatch(/anon\d+@example-anon\.com/);
    });

    it('restores the original email via restore()', () => {
      const original = 'john.doe@gmail.com';
      const { text, restore } = svc.anonymizeText(`Email: ${original}`);
      expect(restore(text)).toContain(original);
    });

    it('assigns distinct tokens for two different emails', () => {
      const { text } = svc.anonymizeText('a@x.com and b@y.com');
      const matches = [...text.matchAll(/anon(\d+)@example-anon\.com/g)];
      expect(matches).toHaveLength(2);
      expect(matches[0]![1]).toBe('0');
      expect(matches[1]![1]).toBe('1');
    });

    it('reuses the same token when the same email appears twice', () => {
      const { text } = svc.anonymizeText('a@x.com see a@x.com again');
      const matches = [...text.matchAll(/anon\d+@example-anon\.com/g)];
      expect(matches).toHaveLength(2);
      expect(matches[0]![0]).toBe(matches[1]![0]);
    });

    it('restores multiple distinct emails correctly', () => {
      const { text, restore } = svc.anonymizeText('Primary: a@x.com  Secondary: b@y.com');
      const restored = restore(text);
      expect(restored).toContain('a@x.com');
      expect(restored).toContain('b@y.com');
    });
  });

  describe('anonymizeText – phone numbers', () => {
    it('replaces a US phone number with a token', () => {
      const { text } = svc.anonymizeText('Call (555) 123-4567 anytime');
      expect(text).not.toContain('555');
      expect(text).toMatch(/\+1000\d{7}/);
    });

    it('replaces a dash-separated phone number', () => {
      const { text } = svc.anonymizeText('Phone: 555-123-4567');
      expect(text).not.toContain('555-123-4567');
    });

    it('restores the original phone via restore()', () => {
      const original = '(555) 123-4567';
      const { text, restore } = svc.anonymizeText(`Phone: ${original}`);
      expect(restore(text)).toContain(original);
    });

    it('replaces a space-only formatted phone number (+1 555 123 4567)', () => {
      const original = '+1 555 123 4567';
      const { text, restore } = svc.anonymizeText(`Phone: ${original}`);
      expect(text).not.toContain('555');
      expect(text).toMatch(/\+1000\d{7}/);
      expect(restore(text)).toContain(original);
    });

    it('replaces a phone number with spaces around dashes (555 - 123 - 4567)', () => {
      const original = '555 - 123 - 4567';
      const { text, restore } = svc.anonymizeText(`Call ${original} anytime`);
      expect(text).not.toContain('555');
      expect(text).toMatch(/\+1000\d{7}/);
      expect(restore(text)).toContain(original);
    });

    it('does not touch year ranges or plain digit sequences', () => {
      const input = '2019-2023 and ID 1234567890';
      const { text } = svc.anonymizeText(input);
      expect(text).toBe(input);
    });
  });

  describe('anonymizeText – restore on LLM JSON output', () => {
    it('restore() works on JSON-stringified structured output', () => {
      const rawText = 'Name: Jane\nEmail: jane@corp.com\nPhone: 555-987-6543';
      const { text: _, restore } = svc.anonymizeText(rawText);

      // Simulate LLM echoing the tokens back in structured JSON
      const llmOutput = {
        basics: {
          name: 'Jane',
          email: 'anon0@example-anon.com',
          phone: '+10000000000',
        },
      };
      const restored = JSON.parse(restore(JSON.stringify(llmOutput))) as typeof llmOutput;
      expect(restored.basics.email).toBe('jane@corp.com');
      expect(restored.basics.phone).toBe('555-987-6543');
      expect(restored.basics.name).toBe('Jane'); // name not anonymized
    });

    it('restore() is a no-op on text with no tokens', () => {
      const { restore } = svc.anonymizeText('no PII here');
      expect(restore('arbitrary output text')).toBe('arbitrary output text');
    });
  });

  // ─── anonymizeSnapshot ────────────────────────────────────────────────────

  const FULL_SNAPSHOT = {
    basics: {
      name: 'Jane Doe',
      label: 'Software Engineer',
      image: 'https://cdn.example.com/photo.jpg',
      email: 'jane@example.com',
      phone: '+1-555-000-1234',
      url: 'https://janedoe.dev',
      summary: 'Experienced full-stack engineer.',
      location: {
        address: '123 Main St',
        postalCode: '94102',
        city: 'San Francisco',
        countryCode: 'US',
        region: 'California',
      },
      profiles: [
        { network: 'LinkedIn', username: 'jane-doe', url: 'https://linkedin.com/in/jane-doe' },
        { network: 'GitHub', username: 'janedoe', url: 'https://github.com/janedoe' },
      ],
    },
    work: [{ name: 'Acme Corp', position: 'Engineer' }],
    skills: [{ name: 'TypeScript' }],
    references: [{ name: 'Bob Manager', reference: 'Excellent engineer, would hire again.' }],
  };

  describe('anonymizeSnapshot – basics PII', () => {
    it('replaces name with [CANDIDATE]', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.name).toBe('[CANDIDATE]');
    });

    it('replaces email with [EMAIL]', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.email).toBe('[EMAIL]');
    });

    it('replaces phone with [PHONE]', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.phone).toBe('[PHONE]');
    });

    it('replaces personal url with [PORTFOLIO_URL]', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.url).toBe('[PORTFOLIO_URL]');
    });

    it('replaces image with [PROFILE_IMAGE]', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.image).toBe('[PROFILE_IMAGE]');
    });
  });

  describe('anonymizeSnapshot – location', () => {
    it('redacts address and postalCode', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.location.address).toBe('[ADDRESS]');
      expect(anon.basics.location.postalCode).toBe('[POSTAL_CODE]');
    });

    it('preserves city, countryCode and region', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.location.city).toBe('San Francisco');
      expect(anon.basics.location.countryCode).toBe('US');
      expect(anon.basics.location.region).toBe('California');
    });
  });

  describe('anonymizeSnapshot – profiles', () => {
    it('redacts username and url for every profile', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      for (const profile of anon.basics.profiles) {
        expect(profile.username).toBe('[PROFILE_USERNAME]');
        expect(profile.url).toBe('[PROFILE_URL]');
      }
    });

    it('preserves the network name', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.profiles[0]!.network).toBe('LinkedIn');
      expect(anon.basics.profiles[1]!.network).toBe('GitHub');
    });
  });

  describe('anonymizeSnapshot – references', () => {
    it('replaces reference name with [REFERENCE_NAME]', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.references[0]!.name).toBe('[REFERENCE_NAME]');
    });

    it('preserves the reference text body', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.references[0]!.reference).toBe('Excellent engineer, would hire again.');
    });
  });

  describe('anonymizeSnapshot – professional content preserved', () => {
    it('keeps label and summary', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.basics.label).toBe('Software Engineer');
      expect(anon.basics.summary).toBe('Experienced full-stack engineer.');
    });

    it('keeps work history and skills intact', () => {
      const anon = svc.anonymizeSnapshot(FULL_SNAPSHOT) as typeof FULL_SNAPSHOT;
      expect(anon.work[0]!.name).toBe('Acme Corp');
      expect(anon.skills[0]!.name).toBe('TypeScript');
    });
  });

  describe('anonymizeSnapshot – immutability and edge cases', () => {
    it('does not mutate the original snapshot', () => {
      svc.anonymizeSnapshot(FULL_SNAPSHOT);
      expect(FULL_SNAPSHOT.basics.name).toBe('Jane Doe');
      expect(FULL_SNAPSHOT.basics.email).toBe('jane@example.com');
    });

    it('handles a snapshot without basics gracefully', () => {
      expect(() => svc.anonymizeSnapshot({ work: [] })).not.toThrow();
    });

    it('handles a snapshot with no location', () => {
      const snap = { basics: { name: 'Jo', email: 'jo@x.com' } };
      const anon = svc.anonymizeSnapshot(snap) as typeof snap;
      expect(anon.basics.name).toBe('[CANDIDATE]');
    });

    it('handles null and undefined without throwing', () => {
      expect(svc.anonymizeSnapshot(null)).toBeNull();
      expect(svc.anonymizeSnapshot(undefined)).toBeUndefined();
    });

    it('handles snapshots with no references array', () => {
      const snap = { basics: { name: 'Jo' } };
      expect(() => svc.anonymizeSnapshot(snap)).not.toThrow();
    });
  });
});
