import { Sequelize, DataTypes } from 'sequelize';

import { MentoringRelationship } from "./mentoringRelationshipModel"
import { ObservationData } from './observationMetaModel';
// import { ObservationData } from './observationMetaModel';

const postgresConnectionDetails = {
    database: process.env.POSTGRES_DATABASE,
    host: process.env.POSTGRES_HOST,
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_USER
}
const sequelize = new Sequelize(postgresConnectionDetails.database, postgresConnectionDetails.user, postgresConnectionDetails.password, {
    host: postgresConnectionDetails.host,
    port: postgresConnectionDetails.port,
    dialect: 'postgres'
})
// Define the MentoringObservation model
const MentoringObservation = sequelize.define('mentoring_observations', {
    uuid_id: {
        type: DataTypes.STRING(250),
        primaryKey: true,
    },
    mentoring_relationship_id: {
        type: DataTypes.STRING(250),
        allowNull: false,
        references: {
            model: MentoringRelationship,
            key: 'mentoring_relationship_id',
        },
    },
    type: {
        type: DataTypes.STRING(250),
        allowNull: false,
    },
    observation_id: {
        type: DataTypes.STRING(250),
    },
    otp_verification_status: {
        type: DataTypes.STRING(250),
        allowNull: false,
    },
    solution_id: {
        type: DataTypes.STRING(250),
    },
    submission_status: {
        type: DataTypes.STRING(250),
    }
});

MentoringObservation.belongsTo(MentoringRelationship, {
    foreignKey: 'mentoring_relationship_id',
    as: 'relationship', // Use a unique alias
});

MentoringObservation.hasOne(ObservationData, {
    foreignKey: 'solution_id',
    sourceKey: 'solution_id',
    as: 'observationData',
});
// ObservationData.belongsTo(MentoringObservation, {
//     foreignKey: 'solution_id',
//     as: 'observationData',
// });

// Synchronize the model with the database (create the table)
// sequelize.sync()
//     .then(() => {
//         console.log('MentoringObservation table created successfully');
//     })
//     .catch((error) => {
//         console.error('Error creating MentoringObservation table:', error);
//     });
// Synchronize the models with the database (create the tables)
sequelize
    .sync()
    .then(() => {
        console.log('Tables created successfully');
    })
    .catch((error) => {
        console.error('Error creating tables:', error);
    });
// Export the model for use in other parts of your application
export { MentoringObservation }