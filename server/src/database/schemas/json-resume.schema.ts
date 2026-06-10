import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { dateProp, EMAIL_RE, URL_RE } from './common';

/**
 * json-resume-schema subdocuments (https://jsonresume.org/schema)
 * All fields optional — empty values are stripped pre-validate, never stored.
 * Ported verbatim from the canonical reference (issue #12 / 1.3).
 */

@Schema({ _id: false })
export class JrLocation {
  @Prop({ trim: true, maxlength: 300 }) address?: string;
  @Prop({ trim: true, maxlength: 20 }) postalCode?: string;
  @Prop({ trim: true, maxlength: 120 }) city?: string;
  @Prop({ trim: true, uppercase: true, minlength: 2, maxlength: 2 }) countryCode?: string;
  @Prop({ trim: true, maxlength: 120 }) region?: string;
}
const JrLocationSchema = SchemaFactory.createForClass(JrLocation);

@Schema({ _id: false })
export class JrProfile {
  @Prop({ trim: true, maxlength: 60 }) network?: string;
  @Prop({ trim: true, maxlength: 120 }) username?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
}
const JrProfileSchema = SchemaFactory.createForClass(JrProfile);

@Schema({ _id: false })
export class JrBasics {
  @Prop({ trim: true, maxlength: 200 }) name?: string;
  @Prop({ trim: true, maxlength: 200 }) label?: string;
  @Prop({ trim: true, match: URL_RE }) image?: string;
  @Prop({ trim: true, lowercase: true, match: EMAIL_RE }) email?: string;
  @Prop({ trim: true, maxlength: 40 }) phone?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
  @Prop({ trim: true, maxlength: 5000 }) summary?: string;
  @Prop({ type: JrLocationSchema }) location?: JrLocation;
  @Prop({ type: [JrProfileSchema], default: undefined }) profiles?: JrProfile[];
}
const JrBasicsSchema = SchemaFactory.createForClass(JrBasics);

@Schema({ _id: false })
export class JrWork {
  @Prop({ trim: true, maxlength: 200 }) name?: string; // company
  @Prop({ trim: true, maxlength: 200 }) location?: string;
  @Prop({ trim: true, maxlength: 1000 }) description?: string;
  @Prop({ trim: true, maxlength: 200 }) position?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
  @Prop(dateProp) startDate?: string;
  @Prop(dateProp) endDate?: string;
  @Prop({ trim: true, maxlength: 5000 }) summary?: string;
  @Prop({ type: [String], default: undefined }) highlights?: string[];
}
const JrWorkSchema = SchemaFactory.createForClass(JrWork);

@Schema({ _id: false })
export class JrVolunteer {
  @Prop({ trim: true, maxlength: 200 }) organization?: string;
  @Prop({ trim: true, maxlength: 200 }) position?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
  @Prop(dateProp) startDate?: string;
  @Prop(dateProp) endDate?: string;
  @Prop({ trim: true, maxlength: 5000 }) summary?: string;
  @Prop({ type: [String], default: undefined }) highlights?: string[];
}
const JrVolunteerSchema = SchemaFactory.createForClass(JrVolunteer);

@Schema({ _id: false })
export class JrEducation {
  @Prop({ trim: true, maxlength: 200 }) institution?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
  @Prop({ trim: true, maxlength: 200 }) area?: string;
  @Prop({ trim: true, maxlength: 100 }) studyType?: string;
  @Prop(dateProp) startDate?: string;
  @Prop(dateProp) endDate?: string;
  @Prop({ trim: true, maxlength: 50 }) score?: string;
  @Prop({ type: [String], default: undefined }) courses?: string[];
}
const JrEducationSchema = SchemaFactory.createForClass(JrEducation);

@Schema({ _id: false })
export class JrAward {
  @Prop({ trim: true, maxlength: 200 }) title?: string;
  @Prop(dateProp) date?: string;
  @Prop({ trim: true, maxlength: 200 }) awarder?: string;
  @Prop({ trim: true, maxlength: 2000 }) summary?: string;
}
const JrAwardSchema = SchemaFactory.createForClass(JrAward);

@Schema({ _id: false })
export class JrCertificate {
  @Prop({ trim: true, maxlength: 200 }) name?: string;
  @Prop(dateProp) date?: string;
  @Prop({ trim: true, maxlength: 200 }) issuer?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
}
const JrCertificateSchema = SchemaFactory.createForClass(JrCertificate);

@Schema({ _id: false })
export class JrPublication {
  @Prop({ trim: true, maxlength: 300 }) name?: string;
  @Prop({ trim: true, maxlength: 200 }) publisher?: string;
  @Prop(dateProp) releaseDate?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
  @Prop({ trim: true, maxlength: 2000 }) summary?: string;
}
const JrPublicationSchema = SchemaFactory.createForClass(JrPublication);

@Schema({ _id: false })
export class JrSkill {
  @Prop({ trim: true, maxlength: 120 }) name?: string;
  @Prop({ trim: true, maxlength: 60 }) level?: string;
  @Prop({ type: [String], default: undefined }) keywords?: string[];
}
const JrSkillSchema = SchemaFactory.createForClass(JrSkill);

@Schema({ _id: false })
export class JrLanguage {
  @Prop({ trim: true, maxlength: 80 }) language?: string;
  @Prop({ trim: true, maxlength: 80 }) fluency?: string;
}
const JrLanguageSchema = SchemaFactory.createForClass(JrLanguage);

@Schema({ _id: false })
export class JrInterest {
  @Prop({ trim: true, maxlength: 120 }) name?: string;
  @Prop({ type: [String], default: undefined }) keywords?: string[];
}
const JrInterestSchema = SchemaFactory.createForClass(JrInterest);

@Schema({ _id: false })
export class JrReference {
  @Prop({ trim: true, maxlength: 200 }) name?: string;
  @Prop({ trim: true, maxlength: 3000 }) reference?: string;
}
const JrReferenceSchema = SchemaFactory.createForClass(JrReference);

@Schema({ _id: false })
export class JrProject {
  @Prop({ trim: true, maxlength: 200 }) name?: string;
  @Prop({ trim: true, maxlength: 5000 }) description?: string;
  @Prop({ type: [String], default: undefined }) highlights?: string[];
  @Prop({ type: [String], default: undefined }) keywords?: string[];
  @Prop(dateProp) startDate?: string;
  @Prop(dateProp) endDate?: string;
  @Prop({ trim: true, match: URL_RE }) url?: string;
  @Prop({ type: [String], default: undefined }) roles?: string[];
  @Prop({ trim: true, maxlength: 200 }) entity?: string;
  @Prop({ trim: true, maxlength: 100 }) type?: string;
}
const JrProjectSchema = SchemaFactory.createForClass(JrProject);

@Schema({ _id: false })
export class JrMeta {
  @Prop({ trim: true, match: URL_RE }) canonical?: string;
  @Prop({ trim: true, maxlength: 20 }) version?: string;
  @Prop({ trim: true, maxlength: 40 }) lastModified?: string;
}
const JrMetaSchema = SchemaFactory.createForClass(JrMeta);

/** Full json-resume document — the canonical stored shape of every resume. */
@Schema({ _id: false })
export class JsonResume {
  @Prop({ type: JrBasicsSchema }) basics?: JrBasics;
  @Prop({ type: [JrWorkSchema], default: undefined }) work?: JrWork[];
  @Prop({ type: [JrVolunteerSchema], default: undefined }) volunteer?: JrVolunteer[];
  @Prop({ type: [JrEducationSchema], default: undefined }) education?: JrEducation[];
  @Prop({ type: [JrAwardSchema], default: undefined }) awards?: JrAward[];
  @Prop({ type: [JrCertificateSchema], default: undefined }) certificates?: JrCertificate[];
  @Prop({ type: [JrPublicationSchema], default: undefined }) publications?: JrPublication[];
  @Prop({ type: [JrSkillSchema], default: undefined }) skills?: JrSkill[];
  @Prop({ type: [JrLanguageSchema], default: undefined }) languages?: JrLanguage[];
  @Prop({ type: [JrInterestSchema], default: undefined }) interests?: JrInterest[];
  @Prop({ type: [JrReferenceSchema], default: undefined }) references?: JrReference[];
  @Prop({ type: [JrProjectSchema], default: undefined }) projects?: JrProject[];
  @Prop({ type: JrMetaSchema }) meta?: JrMeta;
}
export const JsonResumeSchema = SchemaFactory.createForClass(JsonResume);
