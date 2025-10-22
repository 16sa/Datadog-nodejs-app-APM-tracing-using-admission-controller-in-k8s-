***Docker 
apt install docker.io
***A Datadog account and organization API key (API and Application Keys)
***Launch EC2 Instance
Instance Type: t2.medium
AMIs: Amazon Linux
***Create the IAM role having full access
Go to IAM -> Create role -> Select EC2 -> Give Full admin access "AdministratorAccess" -> Name the role EC2-ROLE-FOR-ACCESSING-EKS-CLUSTER
***Attach the IAM role having full access
Go to EC2 -> Click on Actions on the left hand side -> Security -> Modify IAM role
***Install aws iam authenticator
curl -o aws-iam-authenticator https://amazon-eks.s3.us-west-2.amazonaws.com/1.15.10/2020-02-22/bin/linux/amd64/aws-iam-authenticator
chmod +x ./aws-iam-authenticator
sudo mv ./aws-iam-authenticator /usr/local/bin
Test that the aws-iam-authenticator binary works: aws-iam-authenticator help
***Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
apt install unzip
unzip awscliv2.zip
./aws/install
aws –version
***Configure the CLI with my AWS credentials with
aws configure
I was then required to enter my:
AWS Access Key ID
AWS Secret Access Key
Default region name
Default output format: json
Confirm configuration with: aws configure list
***Install and Setup Kubectl (node agent)
curl -LO https://dl.k8s.io/release/$(curl –Ls https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl
chmod +x ./kubectl
mv ./kubectl /usr/local/bin/kubectl
kubectl version --client
***Install and Setup eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
mv /tmp/eksctl /usr/local/bin
eksctl version
***Creating an Amazon EKS cluster using eksctl
Grant the IAM user the necessary least-privileged permissions  in case we are working in production environment or admin permission

Create EKS cluster:
eksctl create cluster --name eks2 --version 1.29 --region eu-west-3 --nodegroup-name worker-nodes --node-type t2.medium --nodes 2 --nodes-min 2 --nodes-max 3

1. Name of the cluster : --eks2
2. Version of Kubernetes : --version 1.29
3. Region : --region eu-west-3
4. Nodegroup name/worker nodes : --nodegroup-name worker-nodes
5. Node Type : --nodegroup-type t2.medium
6. Number of nodes: --nodes 2
7. Minimum Number of nodes: --nodes-min 2
8. Maximum Number of nodes: --nodes-max 3
eksctl will set up an auto-scaling group that starts with 2 "t2.medium" instances, and can scale up to 3 instances if needed, and down to 2 if the load decreases.
in this case eks2 is the name we are giving to our EKS cluster.  The EKS control plane for eks2 is managed by AWS It consists of the Kubernetes API server, scheduler, and etcd (the database)
AWS provides the control plane for us. and this instance from which we run this command, It's only used to configure and interact with the EKS cluster, but it does not become part of the control plane. 
Verify cluster creation with: eksctl get cluster
kubectl get nodes
IF ANY ERROR ==> aws eks update-kubeconfig --region <region-code> --name <cluster-name>

*** In case we want to clean Up
eksctl delete cluster --name eks2 --region eu-west-3
***Helm - Install by running these commands:
Helm is a package manager for Kubernetes. It is a package that contains all the necessary resource definitions and configurations to deploy an application, tool, or service onto a Kubernetes cluster. Think of it like a pre-packaged application with installation instructions for Kubernetes
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
helm version

***Configure Helm by running these commands:

- Add helm chart repository where the chart is located. Helm needs to be configured to know about this repository using this command:
helm repo add datadog https://helm.datadoghq.com

- Update helm chart repository
helm repo update
kubectl create namespace datadog
kubectl create secret generic datadog-secret --from-literal api-key=<DATADOG_API_KEY> -n datadog
Insert Datadog API key at <DATADOG_API_KEY>
***Setup the sample node.js application
We will build a very simple HTTP service (Express) that responds to / and /health, with automatic tracing enabled via the dd-trace library
- In the aws instance Create this Project structure with the content:
nodejs-app/
├── Dockerfile
├── package.json
└── index.js

*** Install npm  and needed library
apt install npm
cd nodejs-app
npm install
***Build and upload the application image
Amazon ECR: a registry for EKS images
- Authenticate with ECR:
aws ecr get-login-password --region eu-west-3 | docker login --username AWS --password-stdin AWS-account-id.dkr.ecr.eu-west-3.amazonaws.com
- Create ecr repositories:
aws ecr describe-repositories --repository-names nodejs-ecr || aws ecr create-repository --repository-name nodejs-ecr
- Build a Docker image for the sample app:
docker build -t nodejs-app:latest .
- Tag the container with the ECR destination:
docker tag nodejs-app:latest $ECR_REPOSITORY_URI /nodejs-ecr:latest

- Upload the container to the ECR registry:
docker push $ECR_REPOSITORY_URI /nodejs-ecr:latest

Your application is now containerized and available for EKS clusters to pull.

-  Since, the focus here is to only turn on APM traces and metrics collection, we have to create a datadog agent values.yaml
We need to check the site configuration where we want our agent to send data it collects.
Configure the Datadog Admission Controller to inject a node.js tracing library to the app container by adding annotation to the pod.
In order to add Datadog standard tags (env, service, version) we have to provide value for this tags using POD labels. In case of using admission controller, datadog will automatically add this variables as env into the POD.
In the the config file, using a socket instead of HTTP or TCP ports is more efficient because it avoids network overhead inside the pod.

***Install the agent and the datadog-values.yaml file contains configuration settings for the Datadog Agent, such as API keys, features to enable, integrations, and resource limits.
  
helm install datadog-agent -f datadog-values.yaml datadog/datadog --namespace datadog

- Verify the admission controller webhook
kubectl get MutatingWebhookConfiguration datadog-webhook -o yaml

***Apply the deployment
kubectl apply -f deployment.yaml
Exec into one of the POD and you will be able to see ENV injected by cluster admission controller. Since, this variables are automatically set, we need not to do anything extra here.
kubectl exec -it <new-nodejs-pod> -- printenv | grep DD_

- check if the tracer is loaded:
kubectl exec -it nodejs-app-66c86b75c5-fkxl2 – sh
node -r dd-trace/init -e "const tracer = require('dd-trace'); console.log('Tracer loaded', tracer._tracer._enabled)"

*** Verify Metrics in Datadog APM
1.	Generate traffic to the pod with “kubectl port-forward pod/<POD_NAME> <LOCAL_PORT:POD_PORT>
kubectl port-forward pod/ nodejs-app-66c86b75c5-fkxl2 3000:3000
the execute this command in another terminal many times: curl -sS http://localhost:3000/
In wait 5-10 min and you will be able to see data in APM section in datadog.
2.	Open the Datadog web interface.
3.	Navigate to APM > Services.
4.	Look for the nodejs-app service


