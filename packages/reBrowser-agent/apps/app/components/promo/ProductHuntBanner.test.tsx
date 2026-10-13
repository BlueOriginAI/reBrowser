import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductHuntBanner, ProductHuntBannerCard } from './ProductHuntBanner'

test('upstream Product Hunt promotion never renders in this fork', () => {
  expect(renderToStaticMarkup(<ProductHuntBanner />)).toBe('')
  expect(
    renderToStaticMarkup(
      <ProductHuntBannerCard onOpen={() => {}} onDismiss={() => {}} />,
    ),
  ).toBe('')
})

test('non-promotional fallback remains available', () => {
  expect(
    renderToStaticMarkup(<ProductHuntBanner fallback={<p>Help</p>} />),
  ).toBe('<p>Help</p>')
})
