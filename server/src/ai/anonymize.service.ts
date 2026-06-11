import { Injectable } from '@nestjs/common';

export interface AnonymizedText {
  text: string;
  /** Replace all anonymization tokens back to originals in any string. */
  restore(output: string): string;
}

/**
 * Email: covers `local@domain.tld` including sub-domains and + aliases.
 * Applied before phone to avoid the @ sign triggering the phone pattern.
 */
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g;

/**
 * Phone: matches NANP-style numbers with at least one separator (space, dash,
 * or dot) between groups so bare digit sequences (years, IDs) are not touched.
 * Handles optional country code (+1 or 1) and optional parentheses.
 *   (555) 123-4567 | 555-123-4567 | 555.123.4567 | +1 555 123 4567
 */
const PHONE_RE = /(\+?1[\s.-])?(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})\b/g;

/**
 * Anonymize PII in resumes before they are sent to an external LLM.
 *
 * Two modes:
 *  - anonymizeText()     – raw resume text (parse pipeline): replaces emails
 *                          and phone numbers with format-preserving tokens;
 *                          returns a `restore` function to put originals back
 *                          into the LLM's JSON output before it is stored.
 *  - anonymizeSnapshot() – structured JSON-Resume object (analysis pipeline):
 *                          redacts personal-contact fields in `basics` and
 *                          reference names; professional content is preserved.
 */
@Injectable()
export class AnonymizationService {
  /**
   * Replace PII in raw resume text with reversible format-preserving tokens.
   *
   * The same original value always gets the same token so the LLM sees
   * consistent placeholders. Call `restore(jsonString)` on the stringified
   * LLM output to swap every token back to its original value before storing.
   */
  anonymizeText(text: string): AnonymizedText {
    const origToToken = new Map<string, string>();
    const tokenToOrig = new Map<string, string>();
    let emailIdx = 0;
    let phoneIdx = 0;

    const getOrCreate = (original: string, factory: () => string): string => {
      let token = origToToken.get(original);
      if (!token) {
        token = factory();
        origToToken.set(original, token);
        tokenToOrig.set(token, original);
      }
      return token;
    };

    const anonymized = text
      .replace(EMAIL_RE, (m) => getOrCreate(m, () => `anon${emailIdx++}@example-anon.com`))
      .replace(PHONE_RE, (m) =>
        getOrCreate(m.trim(), () => `+1000${String(phoneIdx++).padStart(7, '0')}`),
      );

    return {
      text: anonymized,
      restore: (output: string) => {
        let result = output;
        for (const [token, orig] of tokenToOrig) {
          result = result.split(token).join(orig);
        }
        return result;
      },
    };
  }

  /**
   * Return a deep copy of a JSON-Resume snapshot with personal-contact fields
   * replaced by placeholder strings. Professional content (work history,
   * skills, education, etc.) is preserved so analysis quality is unaffected.
   *
   * Redacted fields:
   *   basics.name, basics.email, basics.phone, basics.url, basics.image
   *   basics.location.address, basics.location.postalCode
   *   basics.profiles[*].username, basics.profiles[*].url
   *   references[*].name
   *
   * Kept fields:
   *   basics.label, basics.summary
   *   basics.location.city, .countryCode, .region
   *   basics.profiles[*].network
   *   All work / education / skills / projects sections
   */
  anonymizeSnapshot(snapshot: unknown): unknown {
    if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object') {
      return snapshot;
    }

    const copy = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;

    const basics = copy['basics'] as Record<string, unknown> | undefined;
    if (basics) {
      if ('name' in basics) basics['name'] = '[CANDIDATE]';
      if ('email' in basics) basics['email'] = '[EMAIL]';
      if ('phone' in basics) basics['phone'] = '[PHONE]';
      if ('url' in basics) basics['url'] = '[PORTFOLIO_URL]';
      if ('image' in basics) basics['image'] = '[PROFILE_IMAGE]';

      const location = basics['location'] as Record<string, unknown> | undefined;
      if (location) {
        if ('address' in location) location['address'] = '[ADDRESS]';
        if ('postalCode' in location) location['postalCode'] = '[POSTAL_CODE]';
      }

      const profiles = basics['profiles'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(profiles)) {
        for (const profile of profiles) {
          if ('username' in profile) profile['username'] = '[PROFILE_USERNAME]';
          if ('url' in profile) profile['url'] = '[PROFILE_URL]';
        }
      }
    }

    const references = copy['references'] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(references)) {
      for (const ref of references) {
        if ('name' in ref) ref['name'] = '[REFERENCE_NAME]';
      }
    }

    return copy;
  }
}
