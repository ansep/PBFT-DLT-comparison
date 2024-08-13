# PBFT

docker-compose up --build

CLIENT:

docker ps

docker exec -it pbft-client /bin/bash
npm start
send transaction <from> <to> <value>
send transaction alice bob 4


Check state db:

docker exec -it node1 bash

sqlite3 data/data.db 

SELECT * FROM state;


docker-compose down