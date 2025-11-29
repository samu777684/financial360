const app = require('./app');

app.listen(app.get('port'), () => {
  console.log('Servidor escuchando en el puerto', app.get('port'));
});
import { config } from "dotenv";
config();

export const MERCADOPAGO_API_KEY = process.env.MERCADOPAGO_API_KEY;