describe('Monkae Admin Panel', () => {
  it('Logs in with PIN', () => {
    cy.visit('http://localhost:5173/admin.html')


    cy.get('#login-screen').should('be.visible')

 
    cy.get('button[data-key="1"]').click()
    cy.get('button[data-key="2"]').click()
    cy.get('button[data-key="3"]').click()
    cy.get('button[data-key="4"]').click()
    

    cy.get('#login-submit').click()


    cy.get('#dashboard-container').should('be.visible')
    cy.contains("Today's Bookings").should('be.visible')
  })
})