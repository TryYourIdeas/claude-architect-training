import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import QuestionCard from '~/components/QuestionCard.vue'

const options = [
  { key: 'A', text: 'First option' },
  { key: 'B', text: 'Second option' },
  { key: 'C', text: 'Third option' },
  { key: 'D', text: 'Fourth option' },
]

function mountCard(props: Partial<{ selectCount: number, selected: string[], scenario: number }> = {}) {
  const onUpdate = vi.fn()
  render(QuestionCard, {
    props: {
      position: 1,
      total: 60,
      stem: 'Which mechanism guarantees the refund check runs first?',
      options,
      selectCount: 1,
      selected: [],
      taskStatement: '1.4',
      'onUpdate:selected': onUpdate,
      ...props,
    },
  })
  return { onUpdate }
}

describe('QuestionCard', () => {
  it('announces position, task and the stem to assistive technology', () => {
    mountCard()
    expect(screen.getByText('Question 1 of 60')).toBeInTheDocument()
    expect(screen.getByText('Task 1.4')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /Question 1 of 60/ })).toBeInTheDocument()
    expect(screen.getByText('Which mechanism guarantees the refund check runs first?')).toBeInTheDocument()
  })

  it('uses radio buttons and a single-answer instruction for one-correct items', async () => {
    const { onUpdate } = mountCard()
    expect(screen.getByText('Select one answer')).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(4)
    await userEvent.click(screen.getByLabelText(/Second option/))
    expect(onUpdate).toHaveBeenLastCalledWith(['B'])
  })

  it('uses checkboxes and blocks extra selections for multiple-response items', async () => {
    const { onUpdate } = mountCard({ selectCount: 2, selected: ['A', 'B'] })
    expect(screen.getByText('Select 2 answers')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getByLabelText(/Third option/)).toBeDisabled()
    expect(screen.getByLabelText(/First option/)).not.toBeDisabled()
    await userEvent.click(screen.getByLabelText(/First option/))
    expect(onUpdate).toHaveBeenLastCalledWith(['B'])
  })

  it('reflects the saved selection', () => {
    mountCard({ selected: ['C'] })
    expect(screen.getByLabelText(/Third option/)).toBeChecked()
    expect(screen.getByLabelText(/First option/)).not.toBeChecked()
  })

  it('marks the correct answer and the learner\'s wrong choice after reveal', () => {
    render(QuestionCard, {
      props: {
        position: 2,
        total: 10,
        stem: 'Pick one.',
        options,
        selectCount: 1,
        selected: ['B'],
        correct: ['A'],
        reveal: true,
        disabled: true,
      },
    })
    expect(screen.getByText('Correct answer')).toBeInTheDocument()
    expect(screen.getByText('Your answer')).toBeInTheDocument()
    expect(screen.getByLabelText(/First option/).closest('label')).toHaveAttribute('data-state', 'missed')
    expect(screen.getByLabelText(/Second option/).closest('label')).toHaveAttribute('data-state', 'wrong')
    expect(screen.getAllByRole('radio').every(r => (r as HTMLInputElement).disabled)).toBe(true)
  })

  it('shows no verdict badges before reveal', () => {
    mountCard({ selected: ['B'] })
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument()
    expect(screen.queryByText('Correct answer')).not.toBeInTheDocument()
  })

  it('shows the scenario name and context above the question when one is given', () => {
    mountCard({ scenario: 2 })
    const block = screen.getByTestId('scenario')
    expect(block).toHaveTextContent('Scenario 2: Code Generation with Claude Code')
    expect(block).toHaveTextContent('CLAUDE.md configurations')
  })

  it('shows no scenario block for questions without a scenario', () => {
    mountCard({})
    expect(screen.queryByTestId('scenario')).not.toBeInTheDocument()
  })
})
