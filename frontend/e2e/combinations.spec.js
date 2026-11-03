import { test, expect } from '@playwright/test'
import { api } from './helpers'

// The pricing-model dropdown for each deployment must match deployment_pricing_options in the database
// (the matrix is master data, not something the page decides).
test('pricing models offered per deployment match the database matrix', async ({ page, request }) => {
  const [deployments, pricingModels, options] = await Promise.all([
    api(request, 'GET', '/masters/deployment-models'),
    api(request, 'GET', '/masters/pricing-models'),
    api(request, 'GET', '/masters/deployment-pricing-options'),
  ])
  await page.goto('/rate-cards')
  const deploymentSelect = page.getByRole('combobox', { name: 'Deployment Architecture' })
  const pricingSelect = page.getByRole('combobox', { name: 'Commercial Pricing Model' })
  await expect(deploymentSelect).toBeVisible()

  for (const dep of deployments) {
    await deploymentSelect.selectOption({ label: dep.name })
    const expected = options
      .filter((o) => o.deployment_model_id === dep.id)
      .map((o) => pricingModels.find((pm) => pm.id === o.pricing_model_id)?.name)
      .filter(Boolean)
      .sort()
    const offered = (await pricingSelect.locator('option').allTextContents())
      .filter((t) => !/No pricing methods configured/.test(t))
      .sort()
    expect(offered, `pricing models for ${dep.name}`).toEqual(expected)
  }
})
