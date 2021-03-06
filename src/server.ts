import * as express from 'express';
import * as http from 'http';
import * as process from 'process';
import * as morganBody from 'morgan-body';
import * as cors from 'cors';
// import * as path from 'path';
import * as errorHandler from 'errorhandler';   //import errorHandler = require('errorhandler');
import * as bodyParser from 'body-parser';
import * as socketIo from 'socket.io';
// import * as db from './middlewares/db';
// import * as cookieParser from "cookie-parser";
// import methodOverride = require("method-override");

import Config, { ConfigKeysEnum, DeploymentTypesEnum} from './lib/Config';
import { IndexRoute } from "./controllers/index";
// import * as DB from './middlewares/DB';
import * as mongoose from 'mongoose';

class Server {
    public app: express.Application;
    private server: any;
    private io: any;

    public static bootstrap(): Server {
        return new Server();
    }

    private constructor() {
        //create expressjs application
        this.app = express();

        this.server = http.createServer(this.app);

        // Load environment variables from .env file, where API keys and passwords are configured.
        //dotenv.config({ path: ".env.example" });

        //configure application
        this.setConfig();

        //add routes
        this.setRoutes();
    }

    private setConfig() {
        if (!process.env.NODE_ENV) {
            process.env.NODE_ENV = DeploymentTypesEnum.development;
        }

        // configure the port
        this.app.set('port', process.env.PORT || Config.getConfig(ConfigKeysEnum.port));

        // mount static paths (we don't use this as we are not rendering anything)
        // this.app.use(express.static(path.join(__dirname, "public")));


        // mount logger
        morganBody(this.app);

        // mount cors
        this.app.use(cors({
            exposedHeaders: Config.getConfig(ConfigKeysEnum.corsHeaders)
        }));

        // mount json form parser
        this.app.use(bodyParser.json({
            limit: Config.getConfig(ConfigKeysEnum.bodyLimit)
        }));

        // mount query string parser
        this.app.use(bodyParser.urlencoded({
            extended: true
        }));

        // mount cookie parser
        // this.app.use(cookieParser("SECRET_GOES_HERE"));

        // mongoDb
        this.setMongoDb();

        // socket.io
        this.setSocketIo();

        // catch 404 and forward to error handler
        this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
            err.status = 404;
            next(err);
        });

        //error handling
        this.app.use(errorHandler());

        // start the server
        this.server.listen(this.app.get('port'), () => {
            console.log(`  App is running at 'http://localhost:${this.app.get('port')}' in '${this.app.get('env')}' mode.`);
            console.log(`  Press CTRL-C to stop\n`);
        });

        process.on('exit', () => {
            if (mongoose.connection.readyState === 1) {
                mongoose.connection.close(() => {
                    console.log('Mongoose default connection disconnected through EXIT');
                });
            }
        });
        //catches ctrl+c event
        process.on('SIGINT', () => {
            if (mongoose.connection.readyState === 1) {
                mongoose.connection.close(() => {
                    console.log('Mongoose default connection disconnected through SIGINT');
                    process.exit(0);
                });
            }
        });
        //catches uncaught exceptions
        process.on('uncaughtException', (e: any) => {
            if (mongoose.connection.readyState === 1) {
                mongoose.connection.close(() => {
                    console.log('Mongoose default connection disconnected through uncaughtException');
                });
            }
        });
    }

    private setRoutes() {
        let router: express.Router;

        router = express.Router();

        //IndexRoute
        new IndexRoute(router).createRoutes();

        //use router middleware
        this.app.use(router);
    }

    private setMongoDb() {
        const mongoUrl = Config.getConfig(ConfigKeysEnum.mongoUrl);

        mongoose.connect(mongoUrl);

        // When successfully connected
        mongoose.connection.on('connected', () => {
            console.log('Mongoose default connection open to: ' + mongoUrl);
        });

        // If the connection throws an error
        mongoose.connection.on('error', (err: any) => {
            console.log('MongoDB connection error. Please make sure MongoDB is running. Error: ' + err);
            //process.exit(0);
        });

        // When the connection is disconnected
        mongoose.connection.on('disconnected', () => {
            console.log('Mongoose default connection disconnected from: ' + mongoUrl);
        });
    }

    private setSocketIo(): void {
        this.io = socketIo(this.server);

        this.io.on('connect', (socket: any) => {
            console.log('Connected client on port %s.', this.app.get('port'));

            socket.on('currency', (message: {currency: string, rate: number}) => {
                // console.log('[server](message): %s', JSON.stringify(m));
                this.io.emit('currency_update_rss', message);
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected');
            });
        });

        let count = 0;
        const rec = () => {
            if (count > 10) {
                return;
            }
            setTimeout(() => {
                this.io.emit('currency_update_rss', this.getRandomCurreny());
                count++;
                rec();
            }, 1000);
        };
        rec();
    }
    private getRandomCurreny(): {currency: string, rate: number} {
        enum CurrencyTypeEnums {
            USD,
            GBP,
            EUR,
            TRY,
            JPY
        }

        const random = Math.floor(Math.random() * 10000);

        return {
            currency: CurrencyTypeEnums[random % 5],
            rate: random
        };
    }
}

export default Server.bootstrap();
