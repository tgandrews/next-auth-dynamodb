#!/bin/bash
set -e

AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy

echo "starting Dynamo docker..."

DYNAMO_CONTAINER_ID=$(docker run -tid -P -e AWS_REGION=$AWS_REGION -e AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY amazon/dynamodb-local)
DYNAMO_HOST=$(docker port $DYNAMO_CONTAINER_ID 8000)

echo "dynamo started at: $DYNAMO_HOST"

function finish {
  echo "killing docker..."
  docker rm -vf $DYNAMO_CONTAINER_ID
}
trap finish EXIT

echo "waiting on Dynamo to start..."

./node_modules/.bin/wait-on http://$DYNAMO_HOST/shell

echo "running tests..."

AWS_REGION=${AWS_REGION} \
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} \
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} \
DYNAMODB_URL=http://${DYNAMO_HOST} \
NODE_ENV=test \
./node_modules/.bin/jest --runInBand --detectOpenHandles --forceExit "$@"
