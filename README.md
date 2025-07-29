# Koala UI

<img src="./frontend/src/assets/images/koala_logo.webp" alt="Koala Logo" width="200" height="200">

Koala UI is a modern, user-friendly web application designed to explore and visualize entity linking results efficiently. It features a clean interface, easy navigation, and powerful data handling capabilities.

## Description

Koala UI is built with React and Material-UI, offering a seamless experience for users to manage and visualize datasets related to entity linking results. The application includes functionalities such as login authentication, dataset listing, table viewing, and detailed data visualization.

## Features

- User Authentication
- Dataset Listing
- Table Data Viewing
- Pagination
- Data Visualization
- Responsive Design
- Easy Navigation

## Installation

To get started with Koala UI using Docker, follow these steps:

1. **Clone the repository**
   ```bash
   git clone https://github.com/enRichMyData/koala_ui
   ```

2. **Navigate to the project directory**
   ```bash
   cd koala-ui
   ```

3. **Copy the .env template to .env**
   ```bash
   cp .env.template .env
   ```

4. **Fill out the required environment variables in the .env file.**

   Example:
   ```env
   # Frontend environment variables
   REACT_APP_BACKEND_URL=http://localhost:5001
   REACT_APP_CROCODILE_URL=
   REACT_APP_CROCODILE_SECRET=
   REACT_APP_LAMAPI_URL=
   REACT_APP_LAMAPI_TOKEN=

   # Common environment variables
   NODE_ENV=development
   FLASK_ENV=development
   JWT_SECRET_KEY=

   # Versions
   NODE_VERSION=22
   PYTHON_VERSION=3.12
   MONGO_VERSION=7.0

   # Ports
   FRONTEND_PORT=3000
   BACKEND_PORT=5001
   MONGO_PORT=27017
   ```

   Note: Fill in `REACT_APP_CROCODILE_URL`, `REACT_APP_CROCODILE_TOKEN`, `REACT_APP_LAMAPI_URL`, and `REACT_APP_LAMAPI_TOKEN` based on where your instances of Crocodile and LamAPI are running.

5. **Build and start the containers**
   ```bash
   docker-compose up --build
   ```

6. **Access the application**
   Open your browser and go to `http://localhost:${FRONTEND_PORT}`.

### Prerequisites

Ensure you have active instances of Alligator and LamAPI running. You can find more information and instructions on setting up these services in their respective repositories:
- [Crocodile](https://github.com/enRichMyData/crocodile)
- [LamAPI](https://github.com/unimib-datAI/lamAPI)

## Running in Production

To run the application in production mode:

1. Build and start the containers:
   ```bash
   docker-compose -f docker-compose.prod.yml up --build
   ```

2. Access the application:
   - Frontend: `http://localhost:${FRONTEND_PORT}`
   - Backend: `http://localhost:${BACKEND_PORT}`

## Usage

Once the server is running, you can access the application at `http://localhost:${FRONTEND_PORT}`. 

- **Login:** Use your credentials to log in.
- **Dataset Management:** View and manage your datasets.
- **Table Viewing:** Explore detailed data within tables.
- **Data Visualization:** Visualize data trends and insights.


## Data Format Specification

Koala UI can work with any entity linking system that adopts the following data format. This specification allows other entity linking tools to integrate seamlessly with Koala UI for visualization and annotation.

### Dataset Structure

```json
{
  "data": [
    {
      "dataset_name": "string",
      "total_tables": "number",
      "total_rows": "number", 
      "created_at": "ISO timestamp"
    }
  ],
  "pagination": {
    "next_cursor": "string|null",
    "prev_cursor": "string|null"
  }
}
```

### Table Data Structure

```json
{
  "header": ["column1", "column2", "column3"],
  "rows": [
    {
      "idRow": "unique_row_identifier",
      "data": ["cell_value_1", "cell_value_2", "cell_value_3"],
      "linked_entities": [
        {
          "idColumn": 0,
          "candidates": [
            {
              "id": "Q123456",
              "name": "Entity Name",
              "description": "Entity description",
              "score": 0.95,
              "types": [
                {
                  "id": "Q5",
                  "name": "human"
                }
              ],
              "match": true
            }
          ]
        }
      ]
    }
  ],
  "classified_columns": {
    "NE": {
      "0": "PERSON",
      "2": "LOCATION"
    },
    "LIT": {
      "1": "DATE"
    }
  },
  "column_types": {
    "0": {
      "types": [
        {
          "id": "Q5",
          "name": "human",
          "count": 15
        }
      ]
    }
  },
  "status": "TODO|DOING|DONE"
}
```

### Required Fields

#### Dataset Level
- `dataset_name`: Unique identifier for the dataset
- `total_tables`: Number of tables in the dataset
- `total_rows`: Total number of rows across all tables

#### Table Level
- `header`: Array of column names
- `rows`: Array of data rows with entity linking information
- `status`: Processing status ("DONE", "DOING", or "processing")

#### Row Level
- `idRow`: Unique identifier for the row
- `data`: Array of cell values corresponding to header columns
- `linked_entities`: Array of entity linking results for this row

#### Entity Linking Results
- `idColumn`: Column index (0-based) where entity was found
- `candidates`: Array of potential entity matches
- `id`: Entity identifier (e.g., Wikidata QID)
- `name`: Human-readable entity name
- `description`: Brief description of the entity
- `score`: Confidence score (0.0 to 1.0)
- `types`: Array of entity types with id and name
- `match`: Boolean indicating if this is the selected/best match

#### Column Classification
- `classified_columns.NE`: Named Entity columns with their subtypes
- `classified_columns.LIT`: Literal columns with their subtypes
- `column_types`: Type distribution information per column

### Supported Column Types

#### Named Entity (NE) Types
- `PERSON`: Person names
- `LOCATION`: Geographic locations
- `ORGANIZATION`: Organizations and institutions
- `OTHER`: Other named entities

#### Literal (LIT) Types
- `DATE`: Date values
- `NUMBER`: Numeric values
- `STRING`: Text literals
- `OTHER`: Other literal types

### API Endpoints

Your entity linking system should provide these endpoints:

```
GET /datasets                          - List datasets
GET /datasets/{name}/tables           - List tables in dataset
GET /datasets/{name}/tables/{table}   - Get table data
POST /datasets/{name}/tables          - Upload new table
DELETE /datasets/{name}/tables/{table} - Delete table
GET /datasets/{name}/tables/{table}/status - Get processing status
GET /datasets/{name}/tables/{table}/export - Export enriched data
```

### Example Integration

To integrate your entity linking system with Koala UI:

1. Implement the required API endpoints
2. Format your data according to this specification  
3. Configure Koala UI to point to your backend URL
4. Optionally integrate with external knowledge bases (Wikidata, etc.)

For reference implementation, see the [Crocodile](https://github.com/enRichMyData/crocodile) entity linking system.

## Screenshots

![Main Interface](./frontend/src/assets/images/screenshoot.png)

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes. Make sure to follow the contribution guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For any questions or suggestions, please contact us at [roberto.avogadro@sintef.no](mailto:roberto.avogadro@sintef.no).
