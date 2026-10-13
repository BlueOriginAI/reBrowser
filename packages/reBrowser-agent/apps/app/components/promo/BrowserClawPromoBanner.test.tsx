import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BrowserClawPromoBanner,
  BrowserClawPromoBannerCard,
} from './BrowserClawPromoBanner'

test('upstream download promotion renders no renamed CTA or artwork', () => {
  expect(renderToStaticMarkup(<BrowserClawPromoBanner />)).toBe('')
  expect(
    renderToStaticMarkup(
      <BrowserClawPromoBannerCard onOpen={() => {}} onDismiss={() => {}} />,
    ),
  ).toBe('')
})
