import { LocaleProvider } from '@browseros/i18n/react'
import { cloneElement, isValidElement, type ReactNode, StrictMode } from 'react'
import { createRoot as createReactRoot } from 'react-dom/client'
import { englishTestRuntime } from './test-runtime'

// Import this module after the test DOM is installed, like react-dom/client itself.
export function createRoot(...args: Parameters<typeof createReactRoot>) {
  const root = createReactRoot(...args)
  const render = root.render.bind(root)
  root.render = (children) => {
    if (
      isValidElement<{ children?: ReactNode }>(children) &&
      children.type === StrictMode
    ) {
      render(
        cloneElement(
          children,
          {},
          <LocaleProvider runtime={englishTestRuntime}>
            {children.props.children}
          </LocaleProvider>,
        ),
      )
    } else {
      render(
        <LocaleProvider runtime={englishTestRuntime}>
          {children}
        </LocaleProvider>,
      )
    }
  }
  return root
}
