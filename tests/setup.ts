import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/vue'
import { afterEach } from 'vitest'

// Vitest globals are off, so testing-library must be told to unmount between tests.
afterEach(() => cleanup())
