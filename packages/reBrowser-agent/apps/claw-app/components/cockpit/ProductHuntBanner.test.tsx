import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductHuntBanner, ProductHuntBannerCard } from './ProductHuntBanner'

test('upstream promotion stays disabled regardless of dates or dismissal storage', () => {
  expect(renderToStaticMarkup(<ProductHuntBanner />)).toBe('')
  expect(
    renderToStaticMarkup(
      <ProductHuntBannerCard onOpen={() => {}} onDismiss={() => {}} />,
    ),
  ).toBe('')
})
