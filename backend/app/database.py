#This file contains the code responsilble for connecting our fastapi backend to postgresql
import os
import psycopg

from dotenv import load_dotenv


load_dotenv() #

DATABASE_URL = os.getenv("DATABASE_URL")

def get_connection():
    return psycopg.connect(DATABASE_URL)

#Loads our .env connection string and creates a function that opens a connection to POSTgreSQL
