Feature: Promotional free shipping

  @promotion @smoke @scenario:free-shipping
  Scenario Outline: Show the correct free shipping promotion
    Given a guest customer from "<countryIso>" using language "<languageIso>" and brand "<brand>"
    When the customer visits the promotions page
    Then the free shipping promotion shows title "<promoTitle>", discount "<discount>" and subtitle "<subtitle>"

    Examples:
      | countryIso | languageIso | brand | promoTitle   | discount | subtitle                       |
      | es         | es          | demo  | Envío gratis | 50€      | En pedidos superiores a 50€     |
      | pt         | pt          | demo  | Envio grátis | 60€      | Em compras superiores a 60€     |
