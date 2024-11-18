exports.validateCreditCard = (cardNumber) => {
    const visaRegex = /^4[0-9]{12}(?:[0-9]{3})?$/;
    const masterCardRegex = /^5[1-5][0-9]{14}$/;
  
    // Verificar si es Visa o MasterCard
    if (!visaRegex.test(cardNumber) && !masterCardRegex.test(cardNumber)) {
      return { isValid: false, message: "Invalid card type. Only Visa or MasterCard are accepted." };
    }
  
    // Validación del algoritmo de Luhn
    const digits = cardNumber.split('').reverse().map(Number);
    const checksum = digits.reduce((sum, digit, idx) => {
      if (idx % 2 !== 0) {
        const double = digit * 2;
        return sum + (double > 9 ? double - 9 : double);
      }
      return sum + digit;
    }, 0);
  
    return { isValid: checksum % 10 === 0, message: checksum % 10 === 0 ? "Valid card." : "Invalid card." };
  };
  