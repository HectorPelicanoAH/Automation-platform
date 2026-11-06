@ignore
Feature: Reusable promotion response schema
  Scenario: Define the promotion schema
    * def promotionSchema = { countryIso: '#string', languageIso: '#string', brand: '#string', title: '#string', discount: '#string', subtitle: '#string', thresholdMinor: '#number', currency: '#string' }
