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

function mountCard(props: Partial<{ selectCount: number, selected: string[] }> = {}) {
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
})
