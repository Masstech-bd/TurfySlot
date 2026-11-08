export const getMongoConnectionString = (environment = process.env) => (
  environment.MONGODB_CONN || environment.MONGODB_URI
);
