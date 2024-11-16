# microtarea-4-aws-lambda

Ud está construyendo una app para la venta de tickets a eventos deportivos y espectáculos musicales (una ticketera), en ese sentido quiere comenzar con un MVP que le genere el menor gasto posible.

Para ello, debe implementar 2 funciones lambda en aws.
1. La primera, escucha la inserción de un objeto en un bucket que son los flyers (imágenes) de los eventos y los inserta en una base de datos RDS (asumir que el evento ya existe y el nombre del archivo es el nombre del mismo).
2. La segunda, es accesible vía api gateway (método POST) que gestiona la venta de un espectáculo. Para ello, con una capa debe verificar la validez de la tarjeta de crédito de entrada (visa y master) y disminuir la cantidad de entradas disponibles. Además, para evitar el caso borde de ejecuciones no deseadas, en dynamo se debe implementar el conditional writing - que chequea si la instancia de la función lambda ya fue ejecutada.

## Notas
La BD solo cuenta con una tabla: Nombre evento, costo entrada, entradas disponibles, flyer (img mapeada a un string).
