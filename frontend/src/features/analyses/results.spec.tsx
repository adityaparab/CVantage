import { screen, within } from '@testing-library/react';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import { AnalysisResults } from './AnalysisResults';
import AnalysisScreen from './AnalysisScreen';

import { sampleAnalysis } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const at = { route: `/analyses/${sampleAnalysis.id}`, path: '/analyses/:id' };

describe('analysis results (issue #74 / 8.10)', () => {
  it('renders every section of the full fixture faithfully', () => {
    renderWith(<AnalysisResults analysis={sampleAnalysis} />);
    // gauges with 0-100 semantics
    expect(screen.getByRole('meter', { name: 'Overall match' })).toHaveTextContent('72');
    expect(screen.getByRole('meter', { name: 'ATS score' })).toHaveTextContent('64');
    expect(screen.getByRole('meter', { name: 'Project score' })).toHaveTextContent('58');
    // strong/weak
    expect(screen.getByText('Deep NestJS experience')).toBeInTheDocument();
    expect(screen.getByText('No Kubernetes exposure')).toBeInTheDocument();
    // skills chips
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    // grouped suggestion with field ref + proposed value
    expect(screen.getByText('ATS improvements')).toBeInTheDocument();
    const card = screen.getByText('Mirror the job title').closest('li')!;
    expect(within(card).getByText('basics.label')).toBeInTheDocument();
    expect(within(card).getByText(/Senior Platform Engineer/)).toBeInTheDocument();
    // interview Q&A accordion
    expect(screen.getByText('How would you scale a NestJS API?')).toBeInTheDocument();
    // apply CTA deep link
    expect(screen.getByRole('link', { name: /Apply suggestions/ })).toHaveAttribute(
      'href',
      `/analyses/${sampleAnalysis.id}/apply`,
    );
  });

  it('empty arrays render graceful empty states - no broken sections', () => {
    renderWith(
      <AnalysisResults
        analysis={{
          ...sampleAnalysis,
          result: {
            overallScore: 10,
            atsScore: 5,
            strongPoints: [],
            weakPoints: [],
            matchingSkills: [],
            skillGaps: [],
            suggestions: [],
            interviewQuestions: [],
          },
        }}
      />,
    );
    expect(screen.getByText('None detected.')).toBeInTheDocument();
    expect(screen.getByText('None - nice.')).toBeInTheDocument();
    expect(screen.getAllByText('Nothing here.')).toHaveLength(2);
    expect(screen.getByText('No suggestions')).toBeInTheDocument();
    expect(screen.getByText('No questions generated')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Apply suggestions/ })).not.toBeInTheDocument();
  });

  it('deep link straight to a completed analysis renders results (bell target)', async () => {
    server.use(mswHttp.get('/api/v1/analyses/:id', () => HttpResponse.json(sampleAnalysis)));
    renderWith(<AnalysisScreen />, at);
    expect(await screen.findByText(/Improvement suggestions/i)).toBeInTheDocument();
    // visiting clears the bell server-side (GET side effect, #48) - the
    // client just needs the fetch to have happened, which rendering proves
  });
});
