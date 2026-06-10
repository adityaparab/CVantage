import type { ReactNode } from 'react';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';

import { EMPTY_ROWS } from './form-model';
import type { ResumeFormValues } from './form-model';

import { Field, FormErrorSummary, useArrayField } from '@/components/form';
import { Button, DatePartInput, Input, Textarea } from '@/components/ui';

/** One labeled input bound by path - the editor is built from these. */
function F({
  name,
  label,
  type = 'text',
  placeholder,
  textarea,
  date,
  description,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
  date?: boolean;
  description?: string;
}) {
  const { register, control } = useFormContext();
  return (
    <Field name={name} label={label} description={description}>
      {(ids) =>
        date ? (
          <Controller
            control={control}
            name={name}
            render={({ field }) => (
              <DatePartInput
                {...ids}
                value={(field.value as string) ?? ''}
                onChange={field.onChange}
              />
            )}
          />
        ) : textarea ? (
          <Textarea {...ids} placeholder={placeholder} {...register(name)} />
        ) : (
          <Input {...ids} type={type} placeholder={placeholder} {...register(name)} />
        )
      }
    </Field>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="scroll-mt-24 rounded-card border border-line bg-card p-5 shadow-card"
    >
      <h2 id={`${id}-h`} className="mb-4 text-base font-bold text-ink">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Repeating rows with add/remove/reorder + focus management (#62 helpers). */
function Rows<K extends keyof typeof EMPTY_ROWS>({
  name,
  rowKind,
  addLabel,
  render,
}: {
  name: string;
  rowKind: K;
  addLabel: string;
  render: (prefix: string, index: number) => ReactNode;
}) {
  const { containerRef, fields, add, removeAt, moveUp, moveDown } = useArrayField(name as never);
  return (
    <div ref={containerRef} tabIndex={-1} className="flex flex-col gap-4">
      {fields.map((row, i) => (
        <div
          key={row.id}
          data-array-row
          className="rounded-lg border border-line-2 bg-canvas-2 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[0.78rem] font-semibold text-muted">#{i + 1}</p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move ${addLabel} ${i + 1} up`}
                onClick={() => moveUp(i)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move ${addLabel} ${i + 1} down`}
                onClick={() => moveDown(i)}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${addLabel} ${i + 1}`}
                onClick={() => removeAt(i)}
              >
                ✕
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-4">{render(`${name}.${i}`, i)}</div>
        </div>
      ))}
      <Button
        variant="soft"
        size="sm"
        className="self-start"
        onClick={() => add(EMPTY_ROWS[rowKind] as never)}
      >
        + Add {addLabel}
      </Button>
    </div>
  );
}

export const SECTIONS = [
  { id: 'sec-basics', label: 'Basics' },
  { id: 'sec-work', label: 'Work' },
  { id: 'sec-volunteer', label: 'Volunteer' },
  { id: 'sec-education', label: 'Education' },
  { id: 'sec-awards', label: 'Awards' },
  { id: 'sec-certificates', label: 'Certificates' },
  { id: 'sec-publications', label: 'Publications' },
  { id: 'sec-skills', label: 'Skills' },
  { id: 'sec-languages', label: 'Languages' },
  { id: 'sec-interests', label: 'Interests' },
  { id: 'sec-references', label: 'References' },
  { id: 'sec-projects', label: 'Projects' },
] as const;

/**
 * The full json-resume editor (issue #69 / 8.5) - every field of all 12
 * sections editable; shared by create, review (#71) and the in-place view.
 */
export function ResumeForm({
  form,
  onSubmit,
  submitLabel = 'Save resume',
  busy = false,
  headerExtra,
}: {
  form: UseFormReturn<ResumeFormValues>;
  onSubmit: (values: ResumeFormValues) => void;
  submitLabel?: string;
  busy?: boolean;
  headerExtra?: ReactNode;
}) {
  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav aria-label="Resume sections" className="top-24 self-start lg:sticky lg:w-44">
          <ol className="flex flex-row flex-wrap gap-1 lg:flex-col">
            {SECTIONS.map((sct, i) => (
              <li key={sct.id}>
                <a
                  href={`#${sct.id}`}
                  className="block rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-canvas-3 hover:text-ink"
                >
                  <span className="sr-only">{`Section ${i + 1} of ${SECTIONS.length}: `}</span>
                  {sct.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <form
          noValidate
          className="flex min-w-0 flex-1 flex-col gap-5"
          onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        >
          <FormErrorSummary />
          {headerExtra}

          <Section id="sec-basics" title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <F name="basics.name" label="Full name" placeholder="Ada Lovelace" />
              <F
                name="basics.label"
                label="Professional title"
                placeholder="Senior Software Engineer"
              />
              <F name="basics.email" label="Email" type="email" placeholder="you@example.com" />
              <F name="basics.phone" label="Phone" placeholder="+44 20 7946 0958" />
              <F name="basics.url" label="Website" type="url" placeholder="https://ada.dev" />
            </div>
            <F
              name="basics.summary"
              label="Summary"
              textarea
              placeholder="A short professional summary…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <F name="basics.location.city" label="City" placeholder="London" />
              <F name="basics.location.region" label="Region/State" placeholder="Greater London" />
              <F name="basics.location.countryCode" label="Country code" placeholder="GB" />
              <F name="basics.location.postalCode" label="Postal code" placeholder="EC1A 1BB" />
              <F name="basics.location.address" label="Address" placeholder="1 Analytical Row" />
            </div>
            <h3 className="mt-2 text-sm font-bold text-ink">Profiles</h3>
            <Rows
              name="basics.profiles"
              rowKind="profile"
              addLabel="profile"
              render={(p) => (
                <div className="grid gap-4 sm:grid-cols-3">
                  <F name={`${p}.network`} label="Network" placeholder="GitHub" />
                  <F name={`${p}.username`} label="Username" placeholder="ada" />
                  <F
                    name={`${p}.url`}
                    label="URL"
                    type="url"
                    placeholder="https://github.com/ada"
                  />
                </div>
              )}
            />
          </Section>

          <Section id="sec-work" title="Work experience">
            <Rows
              name="work"
              rowKind="work"
              addLabel="position"
              render={(p) => (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <F name={`${p}.name`} label="Company" placeholder="Analytical Engines Ltd" />
                    <F name={`${p}.position`} label="Position" placeholder="Senior Engineer" />
                    <F
                      name={`${p}.url`}
                      label="Company URL"
                      type="url"
                      placeholder="https://example.com"
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <F name={`${p}.startDate`} label="Start" date />
                      <F name={`${p}.endDate`} label="End" date />
                    </div>
                  </div>
                  <F
                    name={`${p}.summary`}
                    label="Summary"
                    textarea
                    placeholder="What you owned and achieved…"
                  />
                  <F
                    name={`${p}.highlights`}
                    label="Highlights"
                    textarea
                    description="One per line."
                    placeholder={'Cut compute time 40%\nMentored 5 engineers'}
                  />
                </>
              )}
            />
          </Section>

          <Section id="sec-volunteer" title="Volunteer">
            <Rows
              name="volunteer"
              rowKind="volunteer"
              addLabel="role"
              render={(p) => (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <F name={`${p}.organization`} label="Organization" placeholder="Code Club" />
                    <F name={`${p}.position`} label="Role" placeholder="Mentor" />
                    <F name={`${p}.url`} label="URL" type="url" />
                    <div className="grid grid-cols-2 gap-4">
                      <F name={`${p}.startDate`} label="Start" date />
                      <F name={`${p}.endDate`} label="End" date />
                    </div>
                  </div>
                  <F name={`${p}.summary`} label="Summary" textarea />
                  <F
                    name={`${p}.highlights`}
                    label="Highlights"
                    textarea
                    description="One per line."
                  />
                </>
              )}
            />
          </Section>

          <Section id="sec-education" title="Education">
            <Rows
              name="education"
              rowKind="education"
              addLabel="entry"
              render={(p) => (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <F
                      name={`${p}.institution`}
                      label="Institution"
                      placeholder="University of London"
                    />
                    <F name={`${p}.area`} label="Area of study" placeholder="Mathematics" />
                    <F name={`${p}.studyType`} label="Degree" placeholder="BSc" />
                    <F name={`${p}.score`} label="Score/GPA" placeholder="First class" />
                    <div className="grid grid-cols-2 gap-4">
                      <F name={`${p}.startDate`} label="Start" date />
                      <F name={`${p}.endDate`} label="End" date />
                    </div>
                    <F name={`${p}.url`} label="URL" type="url" />
                  </div>
                  <F name={`${p}.courses`} label="Courses" textarea description="One per line." />
                </>
              )}
            />
          </Section>

          <Section id="sec-awards" title="Awards">
            <Rows
              name="awards"
              rowKind="award"
              addLabel="award"
              render={(p) => (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <F name={`${p}.title`} label="Title" placeholder="Engineer of the Year" />
                    <F name={`${p}.awarder`} label="Awarder" placeholder="RAEng" />
                    <F name={`${p}.date`} label="Date" date />
                  </div>
                  <F name={`${p}.summary`} label="Summary" textarea />
                </>
              )}
            />
          </Section>

          <Section id="sec-certificates" title="Certificates">
            <Rows
              name="certificates"
              rowKind="certificate"
              addLabel="certificate"
              render={(p) => (
                <div className="grid gap-4 sm:grid-cols-2">
                  <F name={`${p}.name`} label="Name" placeholder="AWS Solutions Architect" />
                  <F name={`${p}.issuer`} label="Issuer" placeholder="Amazon" />
                  <F name={`${p}.date`} label="Date" date />
                  <F name={`${p}.url`} label="URL" type="url" />
                </div>
              )}
            />
          </Section>

          <Section id="sec-publications" title="Publications">
            <Rows
              name="publications"
              rowKind="publication"
              addLabel="publication"
              render={(p) => (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <F name={`${p}.name`} label="Title" />
                    <F name={`${p}.publisher`} label="Publisher" />
                    <F name={`${p}.releaseDate`} label="Released" date />
                  </div>
                  <F name={`${p}.url`} label="URL" type="url" />
                  <F name={`${p}.summary`} label="Summary" textarea />
                </>
              )}
            />
          </Section>

          <Section id="sec-skills" title="Skills">
            <Rows
              name="skills"
              rowKind="skill"
              addLabel="skill"
              render={(p) => (
                <div className="grid gap-4 sm:grid-cols-3">
                  <F name={`${p}.name`} label="Skill" placeholder="TypeScript" />
                  <F name={`${p}.level`} label="Level" placeholder="Expert" />
                  <F
                    name={`${p}.keywords`}
                    label="Keywords"
                    description="Comma-separated."
                    placeholder="NestJS, React"
                  />
                </div>
              )}
            />
          </Section>

          <Section id="sec-languages" title="Languages">
            <Rows
              name="languages"
              rowKind="language"
              addLabel="language"
              render={(p) => (
                <div className="grid gap-4 sm:grid-cols-2">
                  <F name={`${p}.language`} label="Language" placeholder="English" />
                  <F name={`${p}.fluency`} label="Fluency" placeholder="Native" />
                </div>
              )}
            />
          </Section>

          <Section id="sec-interests" title="Interests">
            <Rows
              name="interests"
              rowKind="interest"
              addLabel="interest"
              render={(p) => (
                <div className="grid gap-4 sm:grid-cols-2">
                  <F name={`${p}.name`} label="Interest" placeholder="Mechanical computing" />
                  <F name={`${p}.keywords`} label="Keywords" description="Comma-separated." />
                </div>
              )}
            />
          </Section>

          <Section id="sec-references" title="References">
            <Rows
              name="references"
              rowKind="reference"
              addLabel="reference"
              render={(p) => (
                <>
                  <F name={`${p}.name`} label="Name" placeholder="Charles Babbage" />
                  <F name={`${p}.reference`} label="Reference" textarea />
                </>
              )}
            />
          </Section>

          <Section id="sec-projects" title="Projects">
            <Rows
              name="projects"
              rowKind="project"
              addLabel="project"
              render={(p) => (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <F name={`${p}.name`} label="Project" placeholder="Difference Engine" />
                    <F name={`${p}.url`} label="URL" type="url" />
                    <div className="grid grid-cols-2 gap-4">
                      <F name={`${p}.startDate`} label="Start" date />
                      <F name={`${p}.endDate`} label="End" date />
                    </div>
                    <F name={`${p}.roles`} label="Roles" description="Comma-separated." />
                  </div>
                  <F name={`${p}.description`} label="Description" textarea />
                  <F
                    name={`${p}.highlights`}
                    label="Highlights"
                    textarea
                    description="One per line."
                  />
                  <F name={`${p}.keywords`} label="Keywords" description="Comma-separated." />
                </>
              )}
            />
          </Section>

          <div className="sticky bottom-4 flex justify-end">
            <Button type="submit" size="lg" loading={busy}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </FormProvider>
  );
}
