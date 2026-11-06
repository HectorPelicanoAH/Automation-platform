Feature: Promotional free shipping API state

  Background:
    * url baseUrl
    * def result = call read('classpath:helpers/promotion-schema.feature')

  # API business-state coverage only; does not verify visible UI rendering.
  @promotion @smoke @scenario:free-shipping
  Scenario Outline: Return the correct promotion business state
    Given path '/api/promotions/free-shipping'
    And params { countryIso: '<countryIso>', languageIso: '<languageIso>', brand: '<brand>' }
    When method get
    Then status 200
    And match response == result.promotionSchema
    And match response.countryIso == '<countryIso>'
    And match response.languageIso == '<languageIso>'
    And match response.brand == '<brand>'
    And match response.title == '<promoTitle>'
    And match response.discount == '<discount>'
    And match response.subtitle == '<subtitle>'
    And match response.thresholdMinor == <thresholdMinor>

    Examples:
      | countryIso | languageIso | brand | promoTitle   | discount | subtitle                   | thresholdMinor |
      | es         | es          | demo  | Envío gratis | 50€      | En pedidos superiores a 50€ | 5000           |
      | pt         | pt          | demo  | Envio grátis | 60€      | Em compras superiores a 60€ | 6000           |
