import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoachChat from '~/components/CoachChat.vue'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('$fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

const props = { sessionId: 's1', questionId: 'Q1', answered: false }

describe('CoachChat', () => {
  it('is labelled for assistive technology and explains the no-spoiler rule before answering', () => {
    render(CoachChat, { props })
    expect(screen.getByRole('region', { name: 'Ask about this question' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your question')).toBeInTheDocument()
    expect(screen.getByText(/will not reveal the answer/)).toBeInTheDocument()
  })

  it('sends the question id and conversation to the server and shows the reply', async () => {
    fetchMock.mockResolvedValue({ reply: 'Consider where enforcement happens.' })
    render(CoachChat, { props })

    await userEvent.type(screen.getByLabelText('Your question'), 'What does enforcement mean?')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Consider where enforcement happens.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/coach/sessions/s1/chat', expect.objectContaining({
      method: 'POST',
      body: { questionId: 'Q1', messages: [{ role: 'user', content: 'What does enforcement mean?' }] },
    }))
  })

  it('keeps the conversation history in later requests', async () => {
    fetchMock.mockResolvedValueOnce({ reply: 'First reply' }).mockResolvedValueOnce({ reply: 'Second reply' })
    render(CoachChat, { props })
    const input = screen.getByLabelText('Your question')

    await userEvent.type(input, 'One')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('First reply')
    await userEvent.type(input, 'Two')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Second reply')

    expect(fetchMock.mock.calls[1]![1].body.messages).toEqual([
      { role: 'user', content: 'One' },
      { role: 'assistant', content: 'First reply' },
      { role: 'user', content: 'Two' },
    ])
  })

  it('shows the server\'s message when the assistant is unavailable', async () => {
    // $fetch errors carry the server's statusMessage in `data`.
    fetchMock.mockRejectedValue(Object.assign(new Error('[POST] 503 Server Error'), {
      data: { statusMessage: 'The chat assistant is not configured.' },
    }))
    render(CoachChat, { props })
    await userEvent.type(screen.getByLabelText('Your question'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not configured')
  })

  it('falls back to a generic message when the server gives no detail', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    render(CoachChat, { props })
    await userEvent.type(screen.getByLabelText('Your question'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not answer')
  })

  it('disables sending while the message is empty', () => {
    render(CoachChat, { props })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('starts a fresh conversation when the question changes', async () => {
    fetchMock.mockResolvedValue({ reply: 'Reply for Q1' })
    const { rerender } = render(CoachChat, { props })
    await userEvent.type(screen.getByLabelText('Your question'), 'Hi')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Reply for Q1')

    await rerender({ ...props, questionId: 'Q2' })
    await waitFor(() => expect(screen.queryByText('Reply for Q1')).not.toBeInTheDocument())
    expect(screen.getByText('No messages yet.')).toBeInTheDocument()
  })
})
