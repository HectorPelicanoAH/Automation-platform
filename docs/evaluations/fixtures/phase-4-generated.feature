Feature: Promotional free shipping API state

  Background:
    * def schema = call read('classpath:helpers/promotion-schema.feature')
    * url baseUrl

  @promotion @smoke @scenario:free-shipping
  Scenario Outline: Return the correct promotion business state
    Given path '/api/promotions/free-shipping'
    And params { countryIso: '<countryIso>', languageIso: '<languageIso>', brand: 'demo' }
    When method get
    Then status 200
    And match response contains { countryIso: '<countryIso>', languageIso: '<languageIso>', brand: 'demo', title: '<title>', discount: '<discount>', subtitle: '<subtitle>', thresholdMinor: <thresholdMinor>, currency: 'EUR' }
    And match response == { countryIso: '#string', languageIso: '#string', brand: '#string', title: '#string', discount: '#string', subtitle: '#string', thresholdMinor: '#number', currency: '#string' }
    And match response == schema.promotionSchema

    Examples:
      | countryIso | languageIso | title        | discount | subtitle                       | thresholdMinor |
      | es         | es          | Envío gratis | 50€      | En pedidos superiores a 50€     | 5000           |
      | pt         | pt          | Envio grátis | 60€      | Em compras superiores a 60€     | 6000           |
